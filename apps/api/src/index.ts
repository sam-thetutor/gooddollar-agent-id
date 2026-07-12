import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Load .env from the repo root before anything reads process.env.
const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "../../../.env");
loadEnv({ path: existsSync(rootEnv) ? rootEnv : undefined });

import { serve } from "@hono/node-server";
import {
  getAgentAttestations,
  getAgentStakes,
  getAgentVaultStatus,
  getClaimEligibility,
  getGBalance,
  getVerifyStatus,
  pingChain,
} from "@goodagent/chain";
import {
  MAX_AGENTS_PER_HUMAN,
  getAgentCredential,
  getAgentCredentialStats,
  issueAgentCredential,
  listAgentCredentialsByHumanRoot,
  listAgentCredentialsByOperator,
  listAgentCredentialsPaged,
  listRecentAuditEvents,
  writeAudit,
} from "@goodagent/db";
import {
  credentialFromWire,
  liveAttestationLookup,
  liveHumanRootLookup,
  liveRevocationLookup,
  verifyAgentAuth,
  verifyAgentId,
  verifyResultToWire,
  type AgentAuthWire,
  type AgentIdCredentialWire,
} from "@goodagent/agent-id";
import {
  addressSchema,
  healthResponseSchema,
  issueAgentRequestSchema,
} from "@goodagent/shared";
import { getAddress, isAddressEqual } from "viem";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors({ origin: "*" }));

app.onError((err, c) => {
  const code = (err as { code?: string }).code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === "P1001" || message.includes("Can't reach database server")) {
    return c.json(
      {
        error: "DATABASE_UNAVAILABLE",
        message:
          "Database is unreachable. For local dev, set VITE_API_BASE_URL to the production API.",
      },
      503,
    );
  }
  console.error(err);
  return c.json({ error: "INTERNAL_ERROR" }, 500);
});

// --- basic in-memory rate limiting -----------------------------------------
// The verify/wallet endpoints each fan out to several Celo RPC reads, so an
// unthrottled caller can exhaust our RPC quota. A fixed-window per-IP counter
// is enough for a single-process deployment. Not a substitute for an edge WAF
// at scale.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rateHits = new Map<string, { count: number; reset: number }>();

app.use("*", async (c, next) => {
  // Only trust proxy-set values. x-real-ip is set by our nginx from the socket
  // address; the RIGHTMOST x-forwarded-for entry is the one nginx appended.
  // The leftmost entries are client-controlled and trivially spoofable, which
  // would let one caller rotate fake IPs to bypass the limiter entirely.
  const xff = c.req.header("x-forwarded-for");
  const ip =
    c.req.header("x-real-ip") ||
    (xff ? xff.split(",").at(-1)?.trim() : undefined) ||
    "unknown";
  const now = Date.now();
  const rec = rateHits.get(ip);
  if (!rec || now > rec.reset) {
    rateHits.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
  } else {
    rec.count += 1;
    if (rec.count > RATE_MAX) {
      return c.json({ error: "RATE_LIMITED" }, 429);
    }
  }
  // Opportunistic cleanup so the map can't grow unbounded.
  if (rateHits.size > 10_000) {
    for (const [k, v] of rateHits) if (now > v.reset) rateHits.delete(k);
  }
  await next();
});

// Short-lived cache for the default (no ?minStake) verify verdict, keyed by
// lowercased agent address. Verification is live, but a 15s TTL is well within
// tolerance and sharply cuts RPC load under repeated lookups of the same agent.
const VERIFY_CACHE_TTL_MS = 15_000;
const verifyCache = new Map<string, { at: number; body: unknown }>();

// --- AgentAuth replay guard -------------------------------------------------
// An AgentAuth proves the agent's key signed a fresh challenge, but the SDK's
// signature check alone is stateless: within the freshness window the same
// signed payload could be replayed to another verifier (or twice to us) to
// impersonate the agent. We reject any (agent, audience, nonce) triple we've
// already accepted, keeping each single-use for its whole validity window.
const AUTH_SEEN_TTL_MS = 20 * 60_000; // safely exceeds the longest max-age we use
const seenAuthNonces = new Map<string, number>();

/**
 * Returns true (and records it) the first time a nonce is seen; false if it is
 * a replay. Bound per agent+audience so distinct verifiers don't collide.
 */
function claimAuthNonce(agent: string, audience: string, nonce: string): boolean {
  const now = Date.now();
  if (seenAuthNonces.size > 50_000) {
    for (const [k, exp] of seenAuthNonces) if (now > exp) seenAuthNonces.delete(k);
  }
  const key = `${agent.toLowerCase()}|${audience}|${nonce}`;
  const existing = seenAuthNonces.get(key);
  if (existing && now < existing) return false;
  seenAuthNonces.set(key, now + AUTH_SEEN_TTL_MS);
  return true;
}

app.get("/health", async (c) => {
  const chainOk = await pingChain();
  const body = healthResponseSchema.parse({
    ok: true,
    service: "gooddollar-agent-id-api",
    version: "0.1.0",
  });
  return c.json({ ...body, chain: chainOk ? "ok" : "unreachable" });
});

app.get("/", (c) =>
  c.json({
    name: "GoodDollar Agent ID API",
    docs: "../../docs/README.md",
    endpoints: [
      "GET /health",
      "GET /wallet/:address",
      "POST /agent/issue",
      "GET /agent/verify/:address?minStake=",
      "POST /agent/verify-auth",
      "GET /agent/list?operator=  (or ?humanRoot=)",
      "GET /explore/stats",
      "GET /explore/agents?query=&page=&pageSize=",
      "GET /explore/agent/:address",
      "GET /explore/activity",
    ],
  }),
);

// ---------------------------------------------------------------------------
// Wallet overview (read-only GoodDollar status for a Celo address)
// ---------------------------------------------------------------------------

app.get("/wallet/:address", async (c) => {
  const address = c.req.param("address");
  if (!addressSchema.safeParse(address).success) {
    return c.json({ error: "BAD_ADDRESS" }, 400);
  }
  try {
    const [balance, verify, claim] = await Promise.all([
      getGBalance(address),
      getVerifyStatus(address),
      getClaimEligibility(address),
    ]);
    return c.json({ address, balance, verify, claim });
  } catch (error) {
    console.error("wallet overview failed", address, error);
    return c.json({ error: "CHAIN_ERROR" }, 502);
  }
});

// ---------------------------------------------------------------------------
// GoodDollar Agent ID — issue & verify Proof-of-Human credentials for agents
// ---------------------------------------------------------------------------

/** Rebuild the wire credential from a stored DB row. */
function recordToWire(rec: {
  agent: string;
  operator: string;
  humanRoot: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  chainId: number;
  verifyingContract: string;
}): AgentIdCredentialWire {
  return {
    fields: {
      agent: rec.agent,
      operator: rec.operator,
      humanRoot: rec.humanRoot,
      nonce: rec.nonce,
      issuedAt: rec.issuedAt,
      expiresAt: rec.expiresAt,
    },
    signature: rec.signature,
    chainId: rec.chainId,
    verifyingContract: rec.verifyingContract,
  };
}

// Submit a signed credential: we re-verify (signature + live human root) before
// persisting, so only genuinely human-backed credentials are ever stored.
app.post("/agent/issue", async (c) => {
  const rawBody = (await c.req.json().catch(() => null)) as
    | (Record<string, unknown> & { agentProof?: AgentAuthWire })
    | null;
  const parsed = issueAgentRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: "BAD_INPUT", issues: parsed.error.issues }, 400);
  }

  let credential;
  try {
    credential = credentialFromWire(parsed.data as AgentIdCredentialWire);
  } catch (error) {
    return c.json({ error: "BAD_CREDENTIAL", message: (error as Error).message }, 400);
  }

  const w = parsed.data;
  const agentAddr = getAddress(w.fields.agent);
  const humanRoot = getAddress(w.fields.humanRoot);

  // Agent-first gate: registration REQUIRES proof that the agent's key exists
  // and consented — either an on-chain attestation in the AgentAttestation
  // registry (preferred: publicly verifiable forever), or a fresh AgentAuth
  // signed by the agent's key and bound to the "register" audience. Without
  // this, an operator could vouch for an address they don't control (squatted
  // registrations). Checked first: the agent consents, then the human vouches.
  let agentProven = false;
  const provenAt = await Promise.resolve(liveAttestationLookup(agentAddr)).catch(
    () => null,
  );
  if (provenAt === null) {
    return c.json(
      {
        error: "ATTESTATION_UNAVAILABLE",
        message: "Could not read the AgentAttestation registry. Try again.",
      },
      503,
    );
  }
  if (provenAt !== 0n) {
    agentProven = true;
  } else if (rawBody?.agentProof) {
    const audience = "gooddollar-agent-id:register";
    const proof = await verifyAgentAuth(rawBody.agentProof, {
      expectedAgent: agentAddr,
      expectedAudience: audience,
      maxAgeSeconds: 900n,
    });
    if (!proof.valid) {
      return c.json({ error: "BAD_AGENT_PROOF", reason: proof.reason }, 400);
    }
    // Single-use: a captured register-proof can't be replayed within its window.
    if (!claimAuthNonce(agentAddr, audience, rawBody.agentProof.nonce)) {
      return c.json({ error: "BAD_AGENT_PROOF", reason: "replayed" }, 400);
    }
    agentProven = true;
  } else {
    return c.json(
      {
        error: "AGENT_NOT_ATTESTED",
        message:
          "The agent must prove it controls this address before it can be registered. Either call attest() on the AgentAttestation registry from the agent's account (or relay its signed AttestAgent message via attestFor), or include a fresh agent-signed 'agentProof' (AgentAuth, audience 'gooddollar-agent-id:register') in this request.",
        attestation: "0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2",
      },
      403,
    );
  }

  const verification = await verifyAgentId(credential, {
    humanRootLookup: liveHumanRootLookup,
  });
  if (!verification.valid) {
    return c.json(
      { error: "INVALID_CREDENTIAL", reason: verification.reason },
      400,
    );
  }

  // Economic requirement: an agent must carry an active refundable G$ bond of at
  // least the vault's `minStake` to be registered. This gives G$ a non-optional
  // role while keeping the deposit fully refundable (it only returns to the
  // operator). The bond must be in place on-chain before issuing.
  const vault = await getAgentVaultStatus(agentAddr).catch(() => null);
  if (!vault || !vault.vaultConfigured) {
    return c.json(
      { error: "VAULT_UNAVAILABLE", message: "Stake vault is not reachable." },
      503,
    );
  }
  if (!vault.meetsMinStake) {
    return c.json(
      {
        error: "STAKE_REQUIRED",
        message: `A refundable bond of at least ${vault.minStakeFormatted} G$ must be staked for this agent before it can be registered.`,
        minStake: vault.minStake,
        minStakeFormatted: vault.minStakeFormatted,
        stake: vault.stake,
        stakeFormatted: vault.stakeFormatted,
      },
      402,
    );
  }

  const operatorAddr = getAddress(w.fields.operator);

  // Anti-hijack: the credential's operator must be the same wallet that owns
  // the on-chain bond. Otherwise any verified human could sign a credential for
  // someone else's already-bonded agent and ride their stake.
  if (vault.operator && !isAddressEqual(getAddress(vault.operator), operatorAddr)) {
    return c.json(
      {
        error: "OPERATOR_MISMATCH",
        message:
          "The agent's on-chain bond is owned by a different wallet than the credential's operator. Stake from the operator wallet, or sign with the wallet that owns the bond.",
      },
      403,
    );
  }

  // Atomic issue: enforces the per-human cap, forbids a different operator from
  // overwriting an existing registration, and requires a strictly increasing
  // nonce so an old signed credential can't be replayed to overwrite or
  // un-revoke a newer one — all inside one serializable transaction.
  const outcome = await issueAgentCredential(
    {
      agent: agentAddr,
      operator: operatorAddr,
      humanRoot,
      nonce: w.fields.nonce,
      issuedAt: w.fields.issuedAt,
      expiresAt: w.fields.expiresAt,
      signature: w.signature,
      chainId: w.chainId,
      verifyingContract: getAddress(w.verifyingContract),
      agentProven,
    },
    MAX_AGENTS_PER_HUMAN,
  );

  if (!outcome.ok) {
    switch (outcome.error) {
      case "OPERATOR_MISMATCH":
        return c.json(
          {
            error: "OPERATOR_MISMATCH",
            message:
              "This agent is already registered by a different operator. Only the original operator can re-issue it.",
          },
          403,
        );
      case "STALE_NONCE":
        return c.json(
          {
            error: "STALE_NONCE",
            message:
              "This credential's nonce is not newer than the stored one. Re-issue with a fresh credential.",
            storedNonce: outcome.storedNonce,
          },
          409,
        );
      case "AGENT_CAP_REACHED":
        return c.json(
          {
            error: "AGENT_CAP_REACHED",
            message: `This human already vouches for the maximum of ${outcome.max} agents. Revoke one to add another.`,
            max: outcome.max,
            active: outcome.active,
          },
          409,
        );
      default:
        return c.json({ error: "ISSUE_FAILED" }, 500);
    }
  }

  const stored = outcome.credential;

  await writeAudit("agent_id_issued", {
    agent: stored.agent,
    operator: stored.operator,
  });

  // A successful (re-)issue changes the stored verdict; drop any cached entry.
  verifyCache.delete(stored.agent.toLowerCase());

  return c.json(
    {
      ok: true,
      agent: stored.agent,
      agentProven,
      verification: verifyResultToWire(verification),
    },
    201,
  );
});

// Off-chain revocation is retired. The signed RevokeAgentID payload had no
// server-side nonce tracking, so a captured signature could be replayed to
// re-revoke a reinstated agent. Revocation now lives solely on-chain in the
// AgentRevocation registry (operator-controlled, replay-proof by construction)
// and verify reads it live. Kept as 410 so old clients get a clear pointer.
app.post("/agent/revoke", (c) =>
  c.json(
    {
      error: "GONE",
      message:
        "Off-chain revocation was removed. Call revoke(agent) on the AgentRevocation contract from the operator wallet, or use the Manage page.",
    },
    410,
  ),
);

// Public verify: anyone can check whether an agent is human-backed right now.
app.get("/agent/verify/:address", async (c) => {
  const raw = c.req.param("address");
  if (!addressSchema.safeParse(raw).success) {
    return c.json({ error: "BAD_ADDRESS" }, 400);
  }
  const agent = getAddress(raw);

  // Optional verifier-chosen minimum bond (base units, e.g. wei of G$). When
  // provided we additionally report whether the live stake meets it. Note the
  // verdict itself already enforces the *vault* minimum below.
  const minStakeRaw = c.req.query("minStake");
  let minStake: bigint | null = null;
  if (minStakeRaw !== undefined) {
    if (!/^\d+$/.test(minStakeRaw)) {
      return c.json({ error: "BAD_MIN_STAKE" }, 400);
    }
    minStake = BigInt(minStakeRaw);
  }

  // Serve the default verdict from the short-lived cache when possible.
  const cacheKey = agent.toLowerCase();
  if (minStake === null) {
    const cached = verifyCache.get(cacheKey);
    if (cached && Date.now() - cached.at < VERIFY_CACHE_TTL_MS) {
      return c.json(cached.body as Record<string, unknown>);
    }
  }

  const rec = await getAgentCredential(agent);
  if (!rec) {
    return c.json({ found: false, valid: false, reason: "not_found", agent });
  }
  if (rec.revokedAt) {
    return c.json({
      found: true,
      valid: false,
      reason: "revoked",
      agent,
      operator: rec.operator,
    });
  }

  try {
    const credential = credentialFromWire(recordToWire(rec));
    // The bond is required for the whole life of the registration, not just at
    // issue time: verification re-reads the live vault stake and fails with
    // `insufficient_bond` if the operator withdrew below the vault minimum.
    const onchainPromise = getAgentVaultStatus(agent).catch(() => null);
    // Key proof-of-possession: read the on-chain AgentAttestation registry in
    // parallel. Informational (doesn't gate validity); falls back to the DB
    // flag set when an agentProof was supplied at issue time.
    const attestationPromise = Promise.resolve(liveAttestationLookup(agent)).catch(
      () => 0n,
    );
    // Track whether the bond was actually read: if the vault is unreachable we
    // don't hard-fail identity on an RPC blip, but we must NOT silently report
    // a bond-less agent as fully valid — callers see `bondChecked: false`.
    let bondChecked = true;
    const result = await verifyAgentId(credential, {
      humanRootLookup: liveHumanRootLookup,
      // On-chain kill switch: an operator revocation in the AgentRevocation
      // registry fails verification with `revoked`, honored the same way the
      // SDK/MCP see it (not just the off-chain DB flag handled above).
      revocationLookup: liveRevocationLookup,
      stakeLookup: async () => {
        const vault = await onchainPromise;
        if (!vault || !vault.vaultConfigured) {
          bondChecked = false;
          return { stake: 0n, minStake: 0n };
        }
        return { stake: BigInt(vault.stake), minStake: BigInt(vault.minStake) };
      },
    });
    const onchain = await onchainPromise;
    const provenAt = await attestationPromise;
    const meetsMinStake =
      minStake === null
        ? undefined
        : onchain
          ? BigInt(onchain.stake) >= minStake
          : false;
    const body = {
      found: true,
      agent,
      ...verifyResultToWire(result),
      bondChecked,
      agentProven: provenAt !== 0n || rec.agentProven,
      ...(provenAt !== 0n ? { agentProvenAt: provenAt.toString() } : {}),
      unstakePending: Boolean(onchain && onchain.unstakeUnlockAt),
      onchain,
      ...(minStake === null
        ? {}
        : { minStake: minStake.toString(), meetsMinStake }),
    };
    // Only cache the live-read default verdict (never a partial/unchecked one).
    if (minStake === null && bondChecked) {
      verifyCache.set(cacheKey, { at: Date.now(), body });
    }
    return c.json(body);
  } catch (error) {
    console.error("verify failed", agent, error);
    return c.json({ error: "VERIFY_ERROR" }, 502);
  }
});

// Authenticated verify: proves the *caller controls the agent key*, not just
// that a valid credential exists for the address. The agent signs a fresh
// AgentAuth challenge; we verify the credential live AND that the auth recovers
// to the agent. Use this (not GET /verify) to authenticate a counterparty —
// a copied public credential is useless without a matching live auth.
app.post("/agent/verify-auth", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    auth?: AgentAuthWire;
    audience?: string;
    minStake?: string;
  } | null;

  if (!body || !body.auth || typeof body.auth !== "object") {
    return c.json({ error: "MISSING_AUTH" }, 400);
  }
  if (!addressSchema.safeParse(body.auth.agent).success) {
    return c.json({ error: "BAD_ADDRESS" }, 400);
  }
  // Audience is mandatory: it binds the proof to *this* verifier so an auth
  // captured elsewhere can't be replayed here. Without it, the anti-replay
  // guarantee is opt-in — which defeats the point of AgentAuth.
  if (typeof body.audience !== "string" || body.audience.length === 0) {
    return c.json(
      {
        error: "MISSING_AUDIENCE",
        message:
          "Pass a non-empty 'audience' identifying your service; the agent must sign an AgentAuth with the same audience.",
      },
      400,
    );
  }
  const agent = getAddress(body.auth.agent);

  // 1. Prove the caller holds the agent key (fresh, agent-signed challenge).
  //    Short window + single-use nonce make a captured auth non-replayable.
  const authResult = await verifyAgentAuth(body.auth, {
    expectedAgent: agent,
    expectedAudience: body.audience,
    maxAgeSeconds: 120n,
  });
  if (!authResult.valid) {
    return c.json(
      { agent, valid: false, authenticated: false, reason: authResult.reason },
      401,
    );
  }
  if (!claimAuthNonce(agent, body.audience, body.auth.nonce)) {
    return c.json(
      { agent, valid: false, authenticated: false, reason: "agent_auth_replayed" },
      401,
    );
  }

  // 2. The credential behind that agent must itself be valid right now.
  const rec = await getAgentCredential(agent);
  if (!rec) {
    return c.json({ agent, valid: false, authenticated: true, reason: "not_found" }, 404);
  }
  if (rec.revokedAt) {
    return c.json({ agent, valid: false, authenticated: true, reason: "revoked" });
  }

  try {
    const credential = credentialFromWire(recordToWire(rec));
    const onchainPromise = getAgentVaultStatus(agent).catch(() => null);
    const attestationPromise = Promise.resolve(liveAttestationLookup(agent)).catch(
      () => 0n,
    );
    let bondChecked = true;
    const result = await verifyAgentId(credential, {
      humanRootLookup: liveHumanRootLookup,
      revocationLookup: liveRevocationLookup,
      stakeLookup: async () => {
        const vault = await onchainPromise;
        if (!vault || !vault.vaultConfigured) {
          bondChecked = false;
          return { stake: 0n, minStake: 0n };
        }
        return { stake: BigInt(vault.stake), minStake: BigInt(vault.minStake) };
      },
    });
    const provenAt = await attestationPromise;
    return c.json({
      agent,
      authenticated: true,
      ...verifyResultToWire(result),
      agentProven: provenAt !== 0n || rec.agentProven,
      ...(provenAt !== 0n ? { agentProvenAt: provenAt.toString() } : {}),
      bondChecked,
    });
  } catch (error) {
    console.error("verify-auth failed", agent, error);
    return c.json({ error: "VERIFY_ERROR" }, 502);
  }
});

// ---------------------------------------------------------------------------
// Public explorer — browse the registry without knowing an address up front
// ---------------------------------------------------------------------------

// Registry-wide stats. The DB counts are cheap; the total bonded G$ needs one
// multicall over every active agent, so the whole payload is cached for 60s.
const STATS_CACHE_TTL_MS = 60_000;
let statsCache: { at: number; body: unknown } | null = null;

app.get("/explore/stats", async (c) => {
  if (statsCache && Date.now() - statsCache.at < STATS_CACHE_TTL_MS) {
    return c.json(statsCache.body as Record<string, unknown>);
  }
  const stats = await getAgentCredentialStats();
  // Live reads over the active set (bounded: the per-human cap keeps it small).
  const { rows } = await listAgentCredentialsPaged({ page: 1, pageSize: 1000 });
  const activeAgents = rows.filter((r) => !r.revokedAt).map((r) => r.agent);
  const [{ totalStaked }, provenMap] = await Promise.all([
    getAgentStakes(activeAgents).catch(() => ({
      stakes: {},
      totalStaked: "0",
    })),
    getAgentAttestations(activeAgents).catch(
      () => ({}) as Record<string, boolean>,
    ),
  ]);
  // The DB flag only captures attestation at issue time; the registry is the
  // source of truth for agents that attested later.
  const attested = activeAgents.filter((a) => provenMap[a.toLowerCase()]).length;
  const body = {
    ...stats,
    attested: Math.max(stats.attested, attested),
    totalStaked,
    totalStakedFormatted: (BigInt(totalStaked) / 10n ** 18n).toString(),
  };
  statsCache = { at: Date.now(), body };
  return c.json(body);
});

// Paginated agent directory with optional address search. Enriches the page
// with each agent's live bond (one multicall for up to `pageSize` reads).
app.get("/explore/agents", async (c) => {
  const query = c.req.query("query")?.trim() || undefined;
  if (query && !/^(0x)?[0-9a-fA-F]{0,40}$/.test(query)) {
    return c.json({ error: "BAD_QUERY" }, 400);
  }
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(c.req.query("pageSize") ?? 20) || 20),
  );

  const { rows, total } = await listAgentCredentialsPaged({ query, page, pageSize });
  const pageAgents = rows.map((r) => r.agent);
  const [{ stakes }, provenMap] = await Promise.all([
    getAgentStakes(pageAgents).catch(() => ({
      stakes: {} as Record<string, string>,
      totalStaked: "0",
    })),
    getAgentAttestations(pageAgents).catch(
      () => ({}) as Record<string, boolean>,
    ),
  ]);

  return c.json({
    page,
    pageSize,
    total,
    agents: rows.map((r) => ({
      agent: r.agent,
      operator: r.operator,
      revoked: Boolean(r.revokedAt),
      agentProven: r.agentProven || Boolean(provenMap[r.agent.toLowerCase()]),
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      stake: stakes[r.agent.toLowerCase()] ?? null,
    })),
  });
});

// Recent registry activity (registrations + revocations) for the explorer feed.
app.get("/explore/activity", async (c) => {
  const events = await listRecentAuditEvents(25);
  return c.json({
    events: events.map((e) => ({
      type: e.eventType,
      agent: (e.metadata as { agent?: string } | null)?.agent ?? null,
      operator: (e.metadata as { operator?: string } | null)?.operator ?? null,
      at: e.createdAt,
    })),
  });
});

// Full public profile for one agent: the stored registration plus every live
// on-chain fact (bond, attestation, revocation) and the current verdict.
app.get("/explore/agent/:address", async (c) => {
  const raw = c.req.param("address");
  if (!addressSchema.safeParse(raw).success) {
    return c.json({ error: "BAD_ADDRESS" }, 400);
  }
  const agent = getAddress(raw);
  const rec = await getAgentCredential(agent);
  if (!rec) return c.json({ found: false, agent }, 404);

  const [vault, provenAt, revokedOnChain] = await Promise.all([
    getAgentVaultStatus(agent).catch(() => null),
    Promise.resolve(liveAttestationLookup(agent)).catch(() => null),
    Promise.resolve(liveRevocationLookup(agent)).catch(() => null),
  ]);

  // Reuse the public verify logic for the verdict itself.
  let verdict: unknown = null;
  try {
    const credential = credentialFromWire(recordToWire(rec));
    let bondChecked = true;
    const result = await verifyAgentId(credential, {
      humanRootLookup: liveHumanRootLookup,
      revocationLookup: liveRevocationLookup,
      stakeLookup: async () => {
        if (!vault || !vault.vaultConfigured) {
          bondChecked = false;
          return { stake: 0n, minStake: 0n };
        }
        return { stake: BigInt(vault.stake), minStake: BigInt(vault.minStake) };
      },
    });
    verdict = {
      ...verifyResultToWire(result),
      ...(rec.revokedAt ? { valid: false, reason: "revoked" } : {}),
      bondChecked,
    };
  } catch {
    verdict = null;
  }

  return c.json({
    found: true,
    agent,
    registration: {
      operator: rec.operator,
      humanRoot: rec.humanRoot,
      nonce: rec.nonce,
      issuedAt: rec.issuedAt,
      expiresAt: rec.expiresAt,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      revokedAt: rec.revokedAt,
    },
    onchain: {
      vault,
      agentProven: provenAt !== null && provenAt !== 0n,
      agentProvenAt:
        provenAt !== null && provenAt !== 0n ? provenAt.toString() : null,
      revokedOnChain,
    },
    verdict,
  });
});

// List the agents a human has vouched for. Query by `operator` (the wallet that
// signed) or by `humanRoot` (the GoodDollar identity, which spans an operator's
// wallets) — the latter powers "all agents this human vouched for".
app.get("/agent/list", async (c) => {
  const operatorRaw = c.req.query("operator");
  const humanRootRaw = c.req.query("humanRoot");

  let rows;
  let key: { operator?: string; humanRoot?: string };
  if (humanRootRaw) {
    if (!addressSchema.safeParse(humanRootRaw).success) {
      return c.json({ error: "BAD_HUMAN_ROOT" }, 400);
    }
    const humanRoot = getAddress(humanRootRaw);
    rows = await listAgentCredentialsByHumanRoot(humanRoot);
    key = { humanRoot };
  } else if (operatorRaw) {
    if (!addressSchema.safeParse(operatorRaw).success) {
      return c.json({ error: "BAD_OPERATOR" }, 400);
    }
    const operator = getAddress(operatorRaw);
    rows = await listAgentCredentialsByOperator(operator);
    key = { operator };
  } else {
    return c.json({ error: "MISSING_QUERY" }, 400);
  }

  const agents = rows.map((r) => ({
    agent: r.agent,
    operator: r.operator,
    expiresAt: r.expiresAt,
    revoked: Boolean(r.revokedAt),
    createdAt: r.createdAt,
  }));
  const activeCount = agents.filter((a) => !a.revoked).length;
  return c.json({
    ...key,
    count: agents.length,
    activeCount,
    maxPerHuman: MAX_AGENTS_PER_HUMAN,
    agents,
  });
});

// Don't bind a port when imported by the test runner — tests drive the app
// through `app.request()` directly.
if (!process.env.VITEST) {
  const port = Number(process.env.API_PORT ?? 3001);
  console.log(`API listening on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
