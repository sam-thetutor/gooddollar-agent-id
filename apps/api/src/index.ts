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
  getClaimEligibility,
  getGBalance,
  getVerifyStatus,
  pingChain,
} from "@g-copilot/chain";
import {
  completePendingAction,
  createPendingAction,
  deleteSession,
  expireStaleActions,
  getAgentCredential,
  getPendingAction,
  getSession,
  linkWallet,
  listAgentCredentialsByOperator,
  upsertAgentCredential,
  verifyLinkToken,
  writeAudit,
} from "@g-copilot/db";
import {
  credentialFromWire,
  liveHumanRootLookup,
  verifyAgentId,
  verifyResultToWire,
  type AgentIdCredentialWire,
} from "@g-copilot/agent-id";
import {
  addressSchema,
  chatRequestSchema,
  completeActionSchema,
  createActionSchema,
  healthResponseSchema,
  issueAgentRequestSchema,
  linkWalletSchema,
} from "@g-copilot/shared";
import { getAddress } from "viem";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { isLlmConfigured, runChat } from "./lib/agent.js";
import { notifyTelegram, validateInitData } from "./lib/telegram.js";

const app = new Hono();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
// Enforce Telegram initData HMAC in production, or when explicitly required.
const REQUIRE_INIT_DATA =
  process.env.NODE_ENV === "production" ||
  process.env.REQUIRE_INIT_DATA === "true";

app.use("*", cors({ origin: "*" }));

app.get("/health", async (c) => {
  const chainOk = await pingChain();
  const body = healthResponseSchema.parse({
    ok: true,
    service: "g-copilot-api",
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
      "GET /agent/verify/:address",
      "GET /agent/list?operator=",
      "POST /chat",
      "GET /sessions/:telegramId",
      "POST /sessions/link",
      "DELETE /sessions/:telegramId",
      "POST /actions",
      "GET /actions/:id",
      "POST /actions/:id/complete",
      "POST /actions/expire",
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
  scopes: string;
  stake: string;
  budgetCap: string;
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
      scopes: rec.scopes,
      stake: rec.stake,
      budgetCap: rec.budgetCap,
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
  const stored = await upsertAgentCredential({
    agent: getAddress(w.fields.agent),
    operator: getAddress(w.fields.operator),
    humanRoot: getAddress(w.fields.humanRoot),
    scopes: w.fields.scopes,
    stake: w.fields.stake,
    budgetCap: w.fields.budgetCap,
    nonce: w.fields.nonce,
    issuedAt: w.fields.issuedAt,
    expiresAt: w.fields.expiresAt,
    signature: w.signature,
    chainId: w.chainId,
    verifyingContract: getAddress(w.verifyingContract),
  });

  await writeAudit("agent_id_issued", undefined, {
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

  try {
    const credential = credentialFromWire(recordToWire(rec));
    const result = await verifyAgentId(credential, {
      humanRootLookup: liveHumanRootLookup,
    });
    return c.json({ found: true, agent, ...verifyResultToWire(result) });
  } catch (error) {
    return c.json(
      { error: "VERIFY_ERROR", message: (error as Error).message },
      502,
    );
  }
});

// List the agents an operator has issued (for the "My Agents" dashboard).
app.get("/agent/list", async (c) => {
  const raw = c.req.query("operator");
  if (!raw || !addressSchema.safeParse(raw).success) {
    return c.json({ error: "BAD_OPERATOR" }, 400);
  }
  const operator = getAddress(raw);
  const rows = await listAgentCredentialsByOperator(operator);
  const agents = rows.map((r) => ({
    agent: r.agent,
    scopes: r.scopes,
    stake: r.stake,
    budgetCap: r.budgetCap,
    expiresAt: r.expiresAt,
    revoked: Boolean(r.revokedAt),
    createdAt: r.createdAt,
  }));
  return c.json({ operator, count: agents.length, agents });
});

// ---------------------------------------------------------------------------
// Chat copilot (LLM + MCP tools)
// ---------------------------------------------------------------------------

app.post("/chat", async (c) => {
  const parsed = chatRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: "BAD_INPUT", issues: parsed.error.issues }, 400);
  }
  if (!isLlmConfigured()) {
    return c.json({ error: "LLM_NOT_CONFIGURED" }, 503);
  }
  try {
    const result = await runChat(parsed.data.messages, {
      wallet: parsed.data.wallet,
    });
    return c.json(result);
  } catch (error) {
    return c.json(
      { error: "CHAT_ERROR", message: (error as Error).message },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

app.get("/sessions/:telegramId", async (c) => {
  const session = await getSession(c.req.param("telegramId"));
  if (!session) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json(session);
});

app.post("/sessions/link", async (c) => {
  const parsed = linkWalletSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "BAD_INPUT", issues: parsed.error.issues }, 400);
  }
  const { telegramId, wallet, initData, token } = parsed.data;

  // Two ways to prove the caller owns this Telegram id:
  //   1. Telegram WebApp `initData` (HMAC) — available inside Telegram's webview.
  //   2. A signed link `token` — for MiniPay's in-app browser / normal browsers
  //      where there is no Telegram WebApp context.
  // initData is checked whenever present; otherwise a valid token is accepted;
  // otherwise (in production) we reject.
  if (initData) {
    if (!BOT_TOKEN) {
      return c.json({ error: "SERVER_MISCONFIGURED" }, 500);
    }
    const result = validateInitData(initData, BOT_TOKEN);
    if (!result.ok) {
      return c.json({ error: "INVALID_INIT_DATA", reason: result.reason }, 401);
    }
    if (result.telegramId && result.telegramId !== telegramId) {
      return c.json({ error: "TELEGRAM_ID_MISMATCH" }, 401);
    }
  } else if (token) {
    const result = verifyLinkToken(token);
    if (!result.ok) {
      return c.json({ error: "INVALID_TOKEN", reason: result.reason }, 401);
    }
    if (result.telegramId !== telegramId) {
      return c.json({ error: "TELEGRAM_ID_MISMATCH" }, 401);
    }
  } else if (REQUIRE_INIT_DATA) {
    return c.json({ error: "INIT_DATA_REQUIRED" }, 401);
  }

  const session = await linkWallet(telegramId, wallet);
  await writeAudit("wallet_linked", telegramId, { wallet });
  const short = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  await notifyTelegram(
    BOT_TOKEN,
    telegramId,
    `✅ Wallet *${short}* connected. Send /status to see your GoodDollar info.`,
  );
  return c.json(session);
});

app.delete("/sessions/:telegramId", async (c) => {
  const telegramId = c.req.param("telegramId");
  await deleteSession(telegramId);
  await writeAudit("session_deleted", telegramId);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Pending actions
// ---------------------------------------------------------------------------

app.post("/actions", async (c) => {
  const parsed = createActionSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: "BAD_INPUT", issues: parsed.error.issues }, 400);
  }
  const action = await createPendingAction({
    telegramId: parsed.data.telegramId,
    actionType: parsed.data.actionType,
    payload: parsed.data.payload,
    ttlMinutes: parsed.data.ttlMinutes,
  });
  return c.json(action, 201);
});

app.get("/actions/:id", async (c) => {
  const action = await getPendingAction(c.req.param("id"));
  if (!action) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json(action);
});

app.post("/actions/:id/complete", async (c) => {
  const id = c.req.param("id");
  const parsed = completeActionSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: "BAD_INPUT", issues: parsed.error.issues }, 400);
  }

  const existing = await getPendingAction(id);
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  if (existing.status !== "pending") {
    return c.json({ error: "ACTION_NOT_PENDING", status: existing.status }, 409);
  }
  if (existing.expiresAt.getTime() < Date.now()) {
    return c.json({ error: "ACTION_EXPIRED" }, 410);
  }

  const action = await completePendingAction(id, parsed.data.txHash);
  await writeAudit("action_completed", existing.telegramId, {
    actionId: id,
    txHash: parsed.data.txHash,
  });
  return c.json(action);
});

app.post("/actions/expire", async (c) => {
  const count = await expireStaleActions();
  return c.json({ ok: true, expired: count });
});

const port = Number(process.env.API_PORT ?? 3001);
console.log(`API listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;
