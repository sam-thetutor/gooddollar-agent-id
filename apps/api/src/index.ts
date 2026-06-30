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
  getAgentVaultStatus,
  getClaimEligibility,
  getGBalance,
  getVerifyStatus,
  pingChain,
} from "@goodagent/chain";
import {
  MAX_AGENTS_PER_HUMAN,
  countActiveAgentsByHumanRoot,
  getAgentCredential,
  listAgentCredentialsByHumanRoot,
  listAgentCredentialsByOperator,
  upsertAgentCredential,
  writeAudit,
} from "@goodagent/db";
import {
  credentialFromWire,
  liveHumanRootLookup,
  verifyAgentId,
  verifyResultToWire,
  type AgentIdCredentialWire,
} from "@goodagent/agent-id";
import {
  addressSchema,
  healthResponseSchema,
  issueAgentRequestSchema,
} from "@goodagent/shared";
import { getAddress } from "viem";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors({ origin: "*" }));

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
      "GET /agent/list?operator=  (or ?humanRoot=)",
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
    return c.json({ error: "CHAIN_ERROR", message: (error as Error).message }, 502);
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
  const parsed = issueAgentRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: "BAD_INPUT", issues: parsed.error.issues }, 400);
  }

  let credential;
  try {
    credential = credentialFromWire(parsed.data as AgentIdCredentialWire);
  } catch (error) {
    return c.json({ error: "BAD_CREDENTIAL", message: (error as Error).message }, 400);
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

  const w = parsed.data;
  const agentAddr = getAddress(w.fields.agent);
  const humanRoot = getAddress(w.fields.humanRoot);

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

  // Sybil guard: one verified human may vouch for at most MAX_AGENTS_PER_HUMAN
  // active agents. Re-issuing an existing agent doesn't count against the cap.
  const activeCount = await countActiveAgentsByHumanRoot(humanRoot, agentAddr);
  if (activeCount >= MAX_AGENTS_PER_HUMAN) {
    return c.json(
      {
        error: "AGENT_CAP_REACHED",
        message: `This human already vouches for the maximum of ${MAX_AGENTS_PER_HUMAN} agents. Revoke one to add another.`,
        max: MAX_AGENTS_PER_HUMAN,
        active: activeCount,
      },
      409,
    );
  }

  const stored = await upsertAgentCredential({
    agent: agentAddr,
    operator: getAddress(w.fields.operator),
    humanRoot,
    nonce: w.fields.nonce,
    issuedAt: w.fields.issuedAt,
    expiresAt: w.fields.expiresAt,
    signature: w.signature,
    chainId: w.chainId,
    verifyingContract: getAddress(w.verifyingContract),
  });

  await writeAudit("agent_id_issued", {
    agent: stored.agent,
    operator: stored.operator,
  });

  return c.json(
    {
      ok: true,
      agent: stored.agent,
      verification: verifyResultToWire(verification),
    },
    201,
  );
});

// Public verify: anyone can check whether an agent is human-backed right now.
app.get("/agent/verify/:address", async (c) => {
  const raw = c.req.param("address");
  if (!addressSchema.safeParse(raw).success) {
    return c.json({ error: "BAD_ADDRESS" }, 400);
  }
  const agent = getAddress(raw);

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

  // Optional verifier-chosen minimum bond (base units, e.g. wei of G$). When
  // provided we report whether the live on-chain stake meets it — the identity
  // verdict itself never depends on stake.
  const minStakeRaw = c.req.query("minStake");
  let minStake: bigint | null = null;
  if (minStakeRaw !== undefined) {
    if (!/^\d+$/.test(minStakeRaw)) {
      return c.json({ error: "BAD_MIN_STAKE" }, 400);
    }
    minStake = BigInt(minStakeRaw);
  }

  try {
    const credential = credentialFromWire(recordToWire(rec));
    const [result, onchain] = await Promise.all([
      verifyAgentId(credential, { humanRootLookup: liveHumanRootLookup }),
      getAgentVaultStatus(agent).catch(() => null),
    ]);
    const meetsMinStake =
      minStake === null
        ? undefined
        : onchain
          ? BigInt(onchain.stake) >= minStake
          : false;
    return c.json({
      found: true,
      agent,
      ...verifyResultToWire(result),
      onchain,
      ...(minStake === null
        ? {}
        : { minStake: minStake.toString(), meetsMinStake }),
    });
  } catch (error) {
    return c.json(
      { error: "VERIFY_ERROR", message: (error as Error).message },
      502,
    );
  }
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

const port = Number(process.env.API_PORT ?? 3001);
console.log(`API listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;
