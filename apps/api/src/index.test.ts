/**
 * API tests: drive the real Hono app through `app.request()` with the Celo
 * reads and the database replaced by in-memory fakes. All EIP-712 signing and
 * verification is the real SDK code — only I/O is faked — so these reproduce
 * offline what the live-test scripts prove against production:
 *
 *   - the attest-first gate (attested / agentProof / neither / registry down)
 *   - the operator-mismatch anti-hijack (bond owner vs credential operator)
 *   - the per-human agent cap
 *   - nonce monotonicity on re-issue
 *   - revoked / insufficient_bond verdicts on verify
 *   - AgentAuth-based authenticated verify
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ---------------------------------------------------------------------------
// Programmable world state, shared with the module mocks below.
// ---------------------------------------------------------------------------

const MIN_STAKE = 250n * 10n ** 18n;

interface DbRecord {
  agent: string;
  operator: string;
  humanRoot: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  chainId: number;
  verifyingContract: string;
  agentProven: boolean;
  revokedAt: Date | null;
  createdAt: Date;
}

const state = vi.hoisted(() => ({
  /** lowercase operator -> whitelisted human root (null = not verified). */
  humanRoots: new Map<string, string>(),
  /** lowercase agent -> attestation provenAt (0n = never attested). */
  provenAt: new Map<string, bigint>(),
  /** When true, the attestation registry read fails (RPC down). */
  attestationDown: false,
  /** lowercase agent -> on-chain revocation flag. */
  revokedOnChain: new Set<string>(),
  /** lowercase agent -> vault entry. */
  vaults: new Map<string, { operator: string | null; stake: bigint; unstakeUnlockAt: string | null }>(),
  /** lowercase agent -> stored credential row. */
  db: new Map<string, DbRecord>(),
  /** Append-only audit events, newest last. */
  audit: [] as { eventType: string; metadata: unknown; createdAt: Date }[],
  reset() {
    this.humanRoots.clear();
    this.provenAt.clear();
    this.attestationDown = false;
    this.revokedOnChain.clear();
    this.vaults.clear();
    this.db.clear();
    this.audit = [];
  },
}));

// ---------------------------------------------------------------------------
// Mock @goodagent/chain — vault + misc reads served from `state`.
// ---------------------------------------------------------------------------

vi.mock("@goodagent/chain", () => ({
  pingChain: async () => true,
  getGBalance: async () => ({ balance: "0", balanceFormatted: "0", symbol: "G$" }),
  getVerifyStatus: async (wallet: string) => ({
    wallet,
    isWhitelisted: false,
    root: null,
    expiresAt: null,
  }),
  getClaimEligibility: async (wallet: string) => ({
    wallet,
    eligible: false,
    isWhitelisted: false,
    hasEntitlement: false,
    claimAmount: "0",
    claimAmountFormatted: "0",
  }),
  getAgentAttestations: async (agents: string[]) => {
    const proven: Record<string, boolean> = {};
    for (const a of agents) {
      proven[a.toLowerCase()] =
        (state.provenAt.get(a.toLowerCase()) ?? 0n) !== 0n;
    }
    return proven;
  },
  getAgentStakes: async (agents: string[]) => {
    const stakes: Record<string, string> = {};
    let total = 0n;
    for (const a of agents) {
      const s = state.vaults.get(a.toLowerCase())?.stake ?? 0n;
      stakes[a.toLowerCase()] = s.toString();
      total += s;
    }
    return { stakes, totalStaked: total.toString() };
  },
  getAgentVaultStatus: async (agent: string) => {
    const entry = state.vaults.get(agent.toLowerCase());
    const stake = entry?.stake ?? 0n;
    return {
      agent,
      vaultConfigured: true,
      operator: entry?.operator ?? null,
      stake: stake.toString(),
      stakeFormatted: (stake / 10n ** 18n).toString(),
      minStake: (250n * 10n ** 18n).toString(),
      minStakeFormatted: "250",
      meetsMinStake: stake >= 250n * 10n ** 18n,
      unstakeUnlockAt: entry?.unstakeUnlockAt ?? null,
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock @goodagent/agent-id — real SDK except the three live chain lookups.
// ---------------------------------------------------------------------------

vi.mock("@goodagent/agent-id", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@goodagent/agent-id")>();
  return {
    ...actual,
    liveHumanRootLookup: async (operator: string) =>
      state.humanRoots.get(operator.toLowerCase()) ?? null,
    liveRevocationLookup: async (agent: string) =>
      state.revokedOnChain.has(agent.toLowerCase()),
    liveAttestationLookup: async (agent: string) => {
      if (state.attestationDown) throw new Error("rpc down");
      return state.provenAt.get(agent.toLowerCase()) ?? 0n;
    },
  };
});

// ---------------------------------------------------------------------------
// Mock @goodagent/db — in-memory store honoring the same invariants as the
// Prisma transaction (operator lock, strictly-increasing nonce, per-human cap).
// ---------------------------------------------------------------------------

vi.mock("@goodagent/db", () => {
  const MAX_AGENTS_PER_HUMAN = 10;
  return {
    MAX_AGENTS_PER_HUMAN,
    writeAudit: async (eventType: string, metadata?: unknown) => {
      state.audit.push({ eventType, metadata, createdAt: new Date() });
    },
    listRecentAuditEvents: async (limit = 25) =>
      state.audit
        .filter((e) =>
          ["agent_id_issued", "agent_id_revoked"].includes(e.eventType),
        )
        .slice(-limit)
        .reverse(),
    getAgentCredential: async (agent: string) =>
      (state.db.get(agent.toLowerCase()) as DbRecord | undefined) ?? null,
    issueAgentCredential: async (
      data: Omit<DbRecord, "revokedAt" | "createdAt">,
      maxPerHuman: number,
    ) => {
      const key = data.agent.toLowerCase();
      const existing = state.db.get(key) as DbRecord | undefined;
      if (existing) {
        if (existing.operator.toLowerCase() !== data.operator.toLowerCase()) {
          return {
            ok: false,
            error: "OPERATOR_MISMATCH",
            storedOperator: existing.operator,
          };
        }
        if (BigInt(data.nonce) <= BigInt(existing.nonce)) {
          return { ok: false, error: "STALE_NONCE", storedNonce: existing.nonce };
        }
      }
      const active = [...state.db.values()].filter(
        (r) =>
          (r as DbRecord).humanRoot.toLowerCase() === data.humanRoot.toLowerCase() &&
          (r as DbRecord).revokedAt === null &&
          (r as DbRecord).agent.toLowerCase() !== key,
      ).length;
      if (active >= maxPerHuman) {
        return { ok: false, error: "AGENT_CAP_REACHED", active, max: maxPerHuman };
      }
      const credential: DbRecord = {
        ...data,
        agentProven: data.agentProven ?? false,
        revokedAt: null,
        createdAt: new Date(),
      };
      state.db.set(key, credential);
      return { ok: true, credential };
    },
    revokeAgentCredential: async (agent: string) => {
      const rec = state.db.get(agent.toLowerCase()) as DbRecord;
      rec.revokedAt = new Date();
      return rec;
    },
    listAgentCredentialsByOperator: async (operator: string) =>
      [...state.db.values()].filter(
        (r) => (r as DbRecord).operator.toLowerCase() === operator.toLowerCase(),
      ),
    listAgentCredentialsByHumanRoot: async (humanRoot: string) =>
      [...state.db.values()].filter(
        (r) => (r as DbRecord).humanRoot.toLowerCase() === humanRoot.toLowerCase(),
      ),
    getAgentCredentialStats: async () => {
      const rows = [...state.db.values()];
      const active = rows.filter((r) => r.revokedAt === null);
      return {
        total: rows.length,
        active: active.length,
        revoked: rows.length - active.length,
        attested: active.filter((r) => r.agentProven).length,
        humans: new Set(active.map((r) => r.humanRoot.toLowerCase())).size,
      };
    },
    listAgentCredentialsPaged: async (opts: {
      query?: string;
      page: number;
      pageSize: number;
    }) => {
      const q = opts.query?.toLowerCase();
      const all = [...state.db.values()]
        .filter(
          (r) =>
            !q ||
            r.agent.toLowerCase().includes(q) ||
            r.operator.toLowerCase().includes(q),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const start = (opts.page - 1) * opts.pageSize;
      return { rows: all.slice(start, start + opts.pageSize), total: all.length };
    },
  };
});

// Import AFTER the mocks so the app wires against the fakes.
import app from "./index.js";
import {
  buildAgentAuth,
  buildAgentId,
  credentialToWire,
  signAgentAuth,
  signAgentId,
} from "@goodagent/agent-id";

// ---------------------------------------------------------------------------
// Test actors & helpers
// ---------------------------------------------------------------------------

const operator = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000a01",
);
const otherOperator = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000a02",
);
const HUMAN_ROOT = operator.address;
const OTHER_ROOT = otherOperator.address;

let agentKeyCounter = 0;
function newAgent() {
  agentKeyCounter += 1;
  const key = `0x${(0xb000 + agentKeyCounter).toString(16).padStart(64, "0")}` as const;
  return privateKeyToAccount(key);
}

async function makeCredentialWire(opts: {
  agent: Address;
  operatorAccount?: typeof operator;
  humanRoot?: Address;
  nonce?: bigint;
}) {
  const op = opts.operatorAccount ?? operator;
  const fields = buildAgentId({
    agent: opts.agent,
    operator: op.address,
    humanRoot: opts.humanRoot ?? HUMAN_ROOT,
    nonce: opts.nonce ?? 1n,
  });
  const credential = await signAgentId(op, fields);
  return credentialToWire(credential);
}

/** Make `agent` fully registrable: attested + bonded by `bondOwner`. */
function prepare(agent: Address, bondOwner: Address = operator.address) {
  state.provenAt.set(agent.toLowerCase(), 1750000000n);
  state.vaults.set(agent.toLowerCase(), {
    operator: bondOwner,
    stake: MIN_STAKE,
    unstakeUnlockAt: null,
  });
}

async function postJson(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Parse a JSON response without fighting undici's `unknown` typing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

beforeEach(() => {
  state.reset();
  // Both operators are verified humans, each their own root.
  state.humanRoots.set(operator.address.toLowerCase(), HUMAN_ROOT);
  state.humanRoots.set(otherOperator.address.toLowerCase(), OTHER_ROOT);
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("reports ok with chain status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.chain).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// POST /agent/issue — attest-first gate
// ---------------------------------------------------------------------------

describe("POST /agent/issue — attest-first gate", () => {
  it("rejects malformed input", async () => {
    const res = await postJson("/agent/issue", { nope: true });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("BAD_INPUT");
  });

  it("403 AGENT_NOT_ATTESTED when the agent never attested and no proof is sent", async () => {
    const agent = newAgent();
    const wire = await makeCredentialWire({ agent: agent.address });
    const res = await postJson("/agent/issue", wire);
    expect(res.status).toBe(403);
    expect((await json(res)).error).toBe("AGENT_NOT_ATTESTED");
  });

  it("503 ATTESTATION_UNAVAILABLE when the registry read fails", async () => {
    state.attestationDown = true;
    const agent = newAgent();
    const wire = await makeCredentialWire({ agent: agent.address });
    const res = await postJson("/agent/issue", wire);
    expect(res.status).toBe(503);
    expect((await json(res)).error).toBe("ATTESTATION_UNAVAILABLE");
  });

  it("accepts a fresh agent-signed proof in lieu of on-chain attestation", async () => {
    const agent = newAgent();
    state.vaults.set(agent.address.toLowerCase(), {
      operator: operator.address,
      stake: MIN_STAKE,
      unstakeUnlockAt: null,
    });
    const wire = await makeCredentialWire({ agent: agent.address });
    const agentProof = await signAgentAuth(
      agent,
      buildAgentAuth({
        agent: agent.address,
        audience: "gooddollar-agent-id:register",
      }),
    );
    const res = await postJson("/agent/issue", { ...wire, agentProof });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.agentProven).toBe(true);
  });

  it("rejects an agentProof bound to the wrong audience", async () => {
    const agent = newAgent();
    const wire = await makeCredentialWire({ agent: agent.address });
    const agentProof = await signAgentAuth(
      agent,
      buildAgentAuth({ agent: agent.address, audience: "some-other-service" }),
    );
    const res = await postJson("/agent/issue", { ...wire, agentProof });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("BAD_AGENT_PROOF");
  });

  it("rejects an agentProof signed by a different key (impersonation)", async () => {
    const agent = newAgent();
    const impostor = newAgent();
    const wire = await makeCredentialWire({ agent: agent.address });
    // Impostor signs a proof claiming to be the agent.
    const forged = await signAgentAuth(
      impostor,
      buildAgentAuth({
        agent: impostor.address,
        audience: "gooddollar-agent-id:register",
      }),
    );
    forged.agent = agent.address; // splice in the victim address
    const res = await postJson("/agent/issue", { ...wire, agentProof: forged });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("BAD_AGENT_PROOF");
  });

  it("rejects a replayed register proof (single-use nonce)", async () => {
    const agent = newAgent();
    state.vaults.set(agent.address.toLowerCase(), {
      operator: operator.address,
      stake: MIN_STAKE,
      unstakeUnlockAt: null,
    });
    const wire = await makeCredentialWire({ agent: agent.address });
    const agentProof = await signAgentAuth(
      agent,
      buildAgentAuth({
        agent: agent.address,
        audience: "gooddollar-agent-id:register",
      }),
    );
    expect((await postJson("/agent/issue", { ...wire, agentProof })).status).toBe(201);

    // Captured proof replayed with a new credential attempt.
    const res = await postJson("/agent/issue", { ...wire, agentProof });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("BAD_AGENT_PROOF");
    expect(body.reason).toBe("replayed");
  });
});

// ---------------------------------------------------------------------------
// POST /agent/issue — credential, bond, and hijack checks
// ---------------------------------------------------------------------------

describe("POST /agent/issue — credential & bond", () => {
  it("rejects a credential whose operator is not a verified human", async () => {
    const agent = newAgent();
    prepare(agent.address);
    state.humanRoots.delete(operator.address.toLowerCase());
    const wire = await makeCredentialWire({ agent: agent.address });
    const res = await postJson("/agent/issue", wire);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("INVALID_CREDENTIAL");
    expect(body.reason).toBe("operator_not_verified");
  });

  it("402 STAKE_REQUIRED when the bond is below the vault minimum", async () => {
    const agent = newAgent();
    prepare(agent.address);
    state.vaults.get(agent.address.toLowerCase())!.stake = MIN_STAKE - 1n;
    const wire = await makeCredentialWire({ agent: agent.address });
    const res = await postJson("/agent/issue", wire);
    expect(res.status).toBe(402);
    expect((await json(res)).error).toBe("STAKE_REQUIRED");
  });

  it("403 OPERATOR_MISMATCH when the bond belongs to a different wallet (anti-hijack)", async () => {
    const agent = newAgent();
    // otherOperator staked the bond; operator tries to register the agent.
    prepare(agent.address, otherOperator.address);
    const wire = await makeCredentialWire({ agent: agent.address });
    const res = await postJson("/agent/issue", wire);
    expect(res.status).toBe(403);
    expect((await json(res)).error).toBe("OPERATOR_MISMATCH");
  });

  it("registers a fully attested + bonded agent", async () => {
    const agent = newAgent();
    prepare(agent.address);
    const wire = await makeCredentialWire({ agent: agent.address });
    const res = await postJson("/agent/issue", wire);
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.agent).toBe(getAddress(agent.address));
    expect(body.agentProven).toBe(true);
    expect(body.verification.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /agent/issue — re-issue invariants (operator lock, nonce, cap)
// ---------------------------------------------------------------------------

describe("POST /agent/issue — re-issue invariants", () => {
  it("only the original operator can re-issue (stored-operator lock)", async () => {
    const agent = newAgent();
    prepare(agent.address);
    const first = await makeCredentialWire({ agent: agent.address, nonce: 1n });
    expect((await postJson("/agent/issue", first)).status).toBe(201);

    // A different verified human re-bonds the agent and tries to take it over.
    state.vaults.get(agent.address.toLowerCase())!.operator = otherOperator.address;
    const takeover = await makeCredentialWire({
      agent: agent.address,
      operatorAccount: otherOperator,
      humanRoot: OTHER_ROOT,
      nonce: 2n,
    });
    const res = await postJson("/agent/issue", takeover);
    expect(res.status).toBe(403);
    expect((await json(res)).error).toBe("OPERATOR_MISMATCH");
  });

  it("rejects a replayed or non-increasing nonce (STALE_NONCE)", async () => {
    const agent = newAgent();
    prepare(agent.address);
    const v2 = await makeCredentialWire({ agent: agent.address, nonce: 2n });
    expect((await postJson("/agent/issue", v2)).status).toBe(201);

    // Replaying the same nonce, or an older one, must fail.
    const replay = await makeCredentialWire({ agent: agent.address, nonce: 2n });
    const res = await postJson("/agent/issue", replay);
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("STALE_NONCE");

    const older = await makeCredentialWire({ agent: agent.address, nonce: 1n });
    expect((await postJson("/agent/issue", older)).status).toBe(409);
  });

  it("accepts a re-issue with a strictly greater nonce", async () => {
    const agent = newAgent();
    prepare(agent.address);
    const v1 = await makeCredentialWire({ agent: agent.address, nonce: 1n });
    expect((await postJson("/agent/issue", v1)).status).toBe(201);
    const v2 = await makeCredentialWire({ agent: agent.address, nonce: 5n });
    expect((await postJson("/agent/issue", v2)).status).toBe(201);
  });

  it("enforces the per-human active-agent cap", async () => {
    // Fill the human's cap with 10 active agents.
    for (let i = 0; i < 10; i += 1) {
      const filler = newAgent();
      state.db.set(filler.address.toLowerCase(), {
        agent: getAddress(filler.address),
        operator: operator.address,
        humanRoot: HUMAN_ROOT,
        nonce: "1",
        issuedAt: "0",
        expiresAt: "99999999999",
        signature: "0x",
        chainId: 42220,
        verifyingContract: "0x0000000000000000000000000000000000000000",
        agentProven: true,
        revokedAt: null,
        createdAt: new Date(),
      });
    }
    const agent = newAgent();
    prepare(agent.address);
    const wire = await makeCredentialWire({ agent: agent.address });
    const res = await postJson("/agent/issue", wire);
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("AGENT_CAP_REACHED");
    expect(body.max).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// GET /agent/verify/:address
// ---------------------------------------------------------------------------

describe("GET /agent/verify/:address", () => {
  async function register(agent: ReturnType<typeof newAgent>) {
    prepare(agent.address);
    const wire = await makeCredentialWire({ agent: agent.address });
    const res = await postJson("/agent/issue", wire);
    expect(res.status).toBe(201);
  }

  it("returns found:false for an unknown agent", async () => {
    const res = await app.request(`/agent/verify/${newAgent().address}`);
    const body = await json(res);
    expect(body.found).toBe(false);
    expect(body.reason).toBe("not_found");
  });

  it("verifies a registered agent with live bond + attestation flags", async () => {
    const agent = newAgent();
    await register(agent);
    const res = await app.request(`/agent/verify/${agent.address}`);
    const body = await json(res);
    expect(body.valid).toBe(true);
    expect(body.bondChecked).toBe(true);
    expect(body.revocationChecked).toBe(true);
    expect(body.agentProven).toBe(true);
  });

  it("fails with insufficient_bond once the stake drops below the minimum", async () => {
    const agent = newAgent();
    await register(agent);
    state.vaults.get(agent.address.toLowerCase())!.stake = 1n;
    const res = await app.request(`/agent/verify/${agent.address}`);
    const body = await json(res);
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("insufficient_bond");
    expect(body.bondChecked).toBe(true);
  });

  it("honors the on-chain revocation registry", async () => {
    const agent = newAgent();
    await register(agent);
    state.revokedOnChain.add(agent.address.toLowerCase());
    const res = await app.request(`/agent/verify/${agent.address}`);
    const body = await json(res);
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("revoked");
  });

  it("fails once the operator loses verified-human status", async () => {
    const agent = newAgent();
    await register(agent);
    state.humanRoots.delete(operator.address.toLowerCase());
    const res = await app.request(`/agent/verify/${agent.address}`);
    const body = await json(res);
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("operator_not_verified");
  });
});

// ---------------------------------------------------------------------------
// POST /agent/revoke — retired (revocation is on-chain only)
// ---------------------------------------------------------------------------

describe("POST /agent/revoke", () => {
  it("is gone: replayable off-chain revoke was retired in favor of on-chain", async () => {
    const res = await postJson("/agent/revoke", {
      agent: newAgent().address,
      operator: operator.address,
      nonce: "1",
      signature: "0xdead",
    });
    expect(res.status).toBe(410);
    expect((await json(res)).error).toBe("GONE");
  });
});

// ---------------------------------------------------------------------------
// GET /explore — public directory
// ---------------------------------------------------------------------------

describe("GET /explore", () => {
  async function register(nonce = 1n) {
    const agent = newAgent();
    prepare(agent.address);
    const wire = await makeCredentialWire({ agent: agent.address, nonce });
    expect((await postJson("/agent/issue", wire)).status).toBe(201);
    return agent;
  }

  it("reports stats including total bonded G$", async () => {
    await register();
    await register();
    const res = await app.request("/explore/stats");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(2);
    expect(body.active).toBe(2);
    expect(body.attested).toBe(2);
    expect(body.humans).toBe(1);
    expect(BigInt(body.totalStaked)).toBe(2n * MIN_STAKE);
  });

  it("lists agents newest-first with live stake, and filters by address", async () => {
    const a = await register();
    const b = await register();
    const res = await app.request("/explore/agents");
    const body = await json(res);
    expect(body.total).toBe(2);
    expect(body.agents).toHaveLength(2);
    expect(body.agents[0].stake).toBe(MIN_STAKE.toString());
    expect(body.agents[0].agentProven).toBe(true);

    const filtered = await app.request(
      `/explore/agents?query=${a.address.slice(2, 12)}`,
    );
    const fb = await json(filtered);
    expect(fb.total).toBe(1);
    expect(fb.agents[0].agent.toLowerCase()).toBe(a.address.toLowerCase());
    expect(
      fb.agents[0].agent.toLowerCase() === b.address.toLowerCase(),
    ).toBe(false);
  });

  it("rejects a non-hex search query", async () => {
    const res = await app.request("/explore/agents?query=%3Cscript%3E");
    expect(res.status).toBe(400);
  });

  it("serves a full public agent profile", async () => {
    const a = await register();
    const res = await app.request(`/explore/agent/${a.address}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.found).toBe(true);
    expect(body.registration.operator.toLowerCase()).toBe(
      operator.address.toLowerCase(),
    );
    expect(body.onchain.agentProven).toBe(true);
    expect(body.onchain.revokedOnChain).toBe(false);
    expect(body.verdict.valid).toBe(true);
  });

  it("404s an unknown agent profile", async () => {
    const res = await app.request(`/explore/agent/${newAgent().address}`);
    expect(res.status).toBe(404);
  });

  it("surfaces registrations in the activity feed", async () => {
    const a = await register();
    const res = await app.request("/explore/activity");
    const body = await json(res);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events[0].type).toBe("agent_id_issued");
    expect(body.events[0].agent.toLowerCase()).toBe(a.address.toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// POST /agent/verify-auth — live proof-of-possession
// ---------------------------------------------------------------------------

describe("POST /agent/verify-auth", () => {
  const AUD = "test-verifier";

  it("rejects a request without an auth payload", async () => {
    const res = await postJson("/agent/verify-auth", {});
    expect(res.status).toBe(400);
  });

  it("rejects a request without an audience (replay scoping is mandatory)", async () => {
    const agent = newAgent();
    const auth = await signAgentAuth(
      agent,
      buildAgentAuth({ agent: agent.address }),
    );
    const res = await postJson("/agent/verify-auth", { auth });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("MISSING_AUDIENCE");
  });

  it("401 when the auth is signed by a different key (stolen credential)", async () => {
    const agent = newAgent();
    const impostor = newAgent();
    prepare(agent.address);
    const wire = await makeCredentialWire({ agent: agent.address });
    expect((await postJson("/agent/issue", wire)).status).toBe(201);

    const forged = await signAgentAuth(
      impostor,
      buildAgentAuth({ agent: impostor.address, audience: AUD }),
    );
    forged.agent = agent.address;
    const res = await postJson("/agent/verify-auth", { auth: forged, audience: AUD });
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.authenticated).toBe(false);
    expect(body.reason).toBe("agent_auth_wrong_agent");
  });

  it("authenticates the real agent and returns the live verdict", async () => {
    const agent = newAgent();
    prepare(agent.address);
    const wire = await makeCredentialWire({ agent: agent.address });
    expect((await postJson("/agent/issue", wire)).status).toBe(201);

    const auth = await signAgentAuth(
      agent,
      buildAgentAuth({ agent: agent.address, audience: AUD }),
    );
    const res = await postJson("/agent/verify-auth", { auth, audience: AUD });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.authenticated).toBe(true);
    expect(body.valid).toBe(true);
    expect(body.agentProven).toBe(true);
    expect(body.bondChecked).toBe(true);
  });

  it("rejects a replayed auth even inside the freshness window", async () => {
    const agent = newAgent();
    prepare(agent.address);
    const wire = await makeCredentialWire({ agent: agent.address });
    expect((await postJson("/agent/issue", wire)).status).toBe(201);

    const auth = await signAgentAuth(
      agent,
      buildAgentAuth({ agent: agent.address, audience: AUD }),
    );
    const first = await postJson("/agent/verify-auth", { auth, audience: AUD });
    expect(first.status).toBe(200);

    // Same signed payload again — an eavesdropper replaying the capture.
    const replay = await postJson("/agent/verify-auth", { auth, audience: AUD });
    expect(replay.status).toBe(401);
    const body = await json(replay);
    expect(body.authenticated).toBe(false);
    expect(body.reason).toBe("agent_auth_replayed");
  });

  it("two fresh auths from the same agent both pass (nonces are unique)", async () => {
    const agent = newAgent();
    prepare(agent.address);
    const wire = await makeCredentialWire({ agent: agent.address });
    expect((await postJson("/agent/issue", wire)).status).toBe(201);

    const a1 = await signAgentAuth(
      agent,
      buildAgentAuth({ agent: agent.address, audience: AUD }),
    );
    const a2 = await signAgentAuth(
      agent,
      buildAgentAuth({ agent: agent.address, audience: AUD }),
    );
    expect(a1.nonce).not.toBe(a2.nonce);
    expect((await postJson("/agent/verify-auth", { auth: a1, audience: AUD })).status).toBe(200);
    expect((await postJson("/agent/verify-auth", { auth: a2, audience: AUD })).status).toBe(200);
  });
});
