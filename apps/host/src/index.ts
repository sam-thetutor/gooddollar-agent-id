import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { serve } from "@hono/node-server";
import {
  confirmDeployPayment,
  createDeployedAgent,
  getDeployedAgent,
  listDeployedAgentsByOwner,
  maxWalletDerivationIndex,
  parseDeployConfiguration,
  recordHeartbeat,
  skipPaymentForDeploy,
  updateDeployedAgent,
  recordDeployMatch,
  recordDeployRefill,
  appendDeployLogLine,
  type DeployStatus,
} from "@goodagent/db";
import {
  fetchSkillsRegistry,
  findRegistrySkill,
  getDeployStats,
  getRuntimeConfig,
  loadRuntimeEnv,
  pm2ProcessSnapshot,
  runDeployPipeline,
  startDeployedAgent,
  stopDeployedAgent,
  setDeployBaselineBalance,
  assertOwnerVouchedForAgent,
  type PipelineStatus,
} from "@goodagent/runtime";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { verifyDeployControl } from "./deploy-control-auth.js";

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "../../../.env");
loadEnv({ path: existsSync(rootEnv) ? rootEnv : undefined, override: true });

const HOST_PORT = Number(process.env.HOST_PORT ?? 3002);
const HOST_INTERNAL_SECRET = process.env.HOST_INTERNAL_SECRET?.trim() ?? "";
const API_BASE = process.env.API_BASE ?? "https://gcopilot-api.geinz.lol";
const DEV_SKIP_PAYMENT = process.env.HOST_DEV_SKIP_PAYMENT === "1";

const app = new Hono();
const runningPipelines = new Set<string>();
const VERIFY_CACHE_MS = 60_000;
const verifyCache = new Map<string, { at: number; data: unknown }>();

app.use("*", cors({ origin: "*" }));

app.onError((err, c) => {
  const code = (err as { code?: string }).code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === "P1001" || message.includes("Can't reach database server")) {
    return c.json(
      {
        error: "DATABASE_UNAVAILABLE",
        message:
          "Database is unreachable from this host. List deploys via the production host API in local dev.",
      },
      503,
    );
  }
  console.error(err);
  return c.json({ error: "INTERNAL_ERROR" }, 500);
});

function internalAuth(c: { req: { header: (name: string) => string | undefined } }): boolean {
  if (!HOST_INTERNAL_SECRET) return false;
  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const header = c.req.header("x-host-secret");
  return bearer === HOST_INTERNAL_SECRET || header === HOST_INTERNAL_SECRET;
}

function pipelineToDeployStatus(status: PipelineStatus): DeployStatus {
  return status;
}

async function scheduleDeployPipeline(
  id: string,
  agent: NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>,
  opts: { skipIdentity?: boolean; dryRun?: boolean },
): Promise<void> {
  const primarySkill = agent.skills[0];
  if (!primarySkill) {
    throw new Error("NO_SKILLS");
  }

  if (!agent.ownerWallet) {
    throw new Error("OWNER_NOT_SET");
  }

  runningPipelines.add(id);
  try {
    loadRuntimeEnv();
    const config = getRuntimeConfig();
    const minDerivationIndex = await maxWalletDerivationIndex();
    await runDeployPipeline(
      config,
      {
        deployId: id,
        displayName: agent.displayName,
        ownerWallet: agent.ownerWallet as `0x${string}`,
        template: agent.template,
        skillId: primarySkill.skillId,
        skillConfiguration: parseDeployConfiguration(agent),
        skipIdentity: opts.skipIdentity,
        dryRun: opts.dryRun,
        minDerivationIndex,
        resume:
          agent.agentAddress && agent.walletDerivationIndex != null
            ? {
                agentAddress: agent.agentAddress as `0x${string}`,
                walletDerivationIndex: agent.walletDerivationIndex,
              }
            : undefined,
      },
      {
        onStatus: async (status, fields) => {
          await updateDeployedAgent(id, {
            status: pipelineToDeployStatus(status),
            ...fields,
          });
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[host] pipeline failed for ${id}:`, err);
    await updateDeployedAgent(id, { status: "failed", lastError: message }).catch(
      () => undefined,
    );
    throw err;
  } finally {
    runningPipelines.delete(id);
  }
}


function publicAgent<T extends { telegramBotTokenEnc?: string | null }>(
  agent: T,
): Omit<T, "telegramBotTokenEnc"> {
  const { telegramBotTokenEnc: _, ...rest } = agent;
  return rest;
}

async function fetchVerifyStatus(agentAddress: string): Promise<unknown | null> {
  const cached = verifyCache.get(agentAddress);
  if (cached && Date.now() - cached.at < VERIFY_CACHE_MS) {
    return cached.data;
  }
  try {
    const res = await fetch(`${API_BASE}/agent/verify/${agentAddress}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    verifyCache.set(agentAddress, { at: Date.now(), data });
    return data;
  } catch {
    return cached?.data ?? null;
  }
}

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "goodagent-host",
    pm2: process.env.PM2_HOME ? "configured" : "local",
  }),
);

app.get("/deploy", async (c) => {
  const ownerWallet = c.req.query("ownerWallet");
  if (!ownerWallet) {
    return c.json({ error: "ownerWallet query param required" }, 400);
  }
  const agents = await listDeployedAgentsByOwner(ownerWallet);
  return c.json({ agents: agents.map(publicAgent) });
});

app.post("/deploy", async (c) => {
  const body = await c.req.json<{
    displayName?: string;
    template?: string;
    ownerWallet?: string;
    skillId?: string;
    skillIds?: string[];
    configuration?: Record<string, string>;
    skipPayment?: boolean;
  }>();

  if (!body.displayName?.trim()) {
    return c.json({ error: "displayName is required" }, 400);
  }

  let skills;
  try {
    const requestedSkillIds =
      body.skillIds?.length
        ? body.skillIds
        : body.skillId
          ? [body.skillId]
          : ["gaming/wagering/gamearena_1v1"];

    const registry = await fetchSkillsRegistry();
    skills = requestedSkillIds.map((skillId) => {
      const entry = findRegistrySkill(registry, skillId);
      if (!entry) {
        throw new Error(`skill_id not in registry: ${skillId}`);
      }
      return { skillId: entry.skill_id, registryPath: entry.path };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 400);
  }

  loadRuntimeEnv();

  let agent = await createDeployedAgent({
    displayName: body.displayName.trim(),
    template: body.template ?? "gaming",
    ownerWallet: body.ownerWallet,
    skills,
    configuration: body.configuration ?? null,
  });

  if (body.skipPayment && DEV_SKIP_PAYMENT) {
    await skipPaymentForDeploy(agent.id);
    agent = (await getDeployedAgent(agent.id)) ?? agent;
  }

  return c.json({ agent: publicAgent(agent) }, 201);
});

app.get("/deploy/:id", async (c) => {
  const agent = await getDeployedAgent(c.req.param("id"));
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ agent: publicAgent(agent) });
});

app.get("/deploy/:id/status", async (c) => {
  const agent = await getDeployedAgent(c.req.param("id"));
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const pm2 = agent.pm2Name ? pm2ProcessSnapshot(agent.pm2Name) : null;
  const verify = agent.agentAddress
    ? await fetchVerifyStatus(agent.agentAddress)
    : null;

  let stats = null;
  if (agent.agentAddress) {
    try {
      loadRuntimeEnv();
      const config = getRuntimeConfig();
      const skillConfig = parseDeployConfiguration(agent);

      stats = await getDeployStats({
        agentsRoot: config.agentsRoot,
        deployId: agent.id,
        agentAddress: agent.agentAddress as `0x${string}`,
        skillId: agent.skills[0]?.skillId ?? null,
        rpcUrl: config.rpcUrl,
        configBaselineGs: skillConfig.BASELINE_GS ?? null,
        playMode:
          skillConfig.PLAY_MODE === "onchain"
            ? "onchain"
            : skillConfig.PLAY_MODE === "offchain"
              ? "offchain"
              : null,
        challengeAiUrl: skillConfig.CHALLENGE_AI_URL ?? null,
      });
    } catch (err) {
      console.warn(`[host] stats for ${agent.id}:`, err);
    }
  }

  return c.json({
    id: agent.id,
    displayName: agent.displayName,
    template: agent.template,
    skillId: agent.skills[0]?.skillId ?? null,
    configuration: agent.configuration,
    status: agent.status,
    ownerWallet: agent.ownerWallet,
    agentAddress: agent.agentAddress,
    pm2Name: agent.pm2Name,
    lastHeartbeatAt: agent.lastHeartbeatAt,
    lastError: agent.lastError,
    deployedAt: agent.deployedAt,
    pipelineRunning: runningPipelines.has(agent.id),
    pm2,
    verify,
    stats,
  });
});

app.post("/deploy/:id/confirm-payment", async (c) => {
  const { txHash } = await c.req.json<{ txHash?: string }>();
  if (!txHash?.trim()) return c.json({ error: "txHash required" }, 400);

  const existing = await getDeployedAgent(c.req.param("id"));
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  if (existing.status !== "pending_payment") {
    return c.json({ error: "INVALID_STATUS", status: existing.status }, 409);
  }

  const agent = await confirmDeployPayment(c.req.param("id"), txHash.trim());
  return c.json({ agent: publicAgent(agent) });
});

app.post("/deploy/:id/skip-payment", async (c) => {
  if (!DEV_SKIP_PAYMENT) {
    return c.json({ error: "SKIP_PAYMENT_DISABLED" }, 403);
  }

  const existing = await getDeployedAgent(c.req.param("id"));
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  if (existing.status !== "pending_payment") {
    return c.json({ error: "INVALID_STATUS", status: existing.status }, 409);
  }

  const agent = await skipPaymentForDeploy(c.req.param("id"));
  return c.json({ agent: publicAgent(agent) });
});

app.post("/deploy/:id/run-pipeline", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req
    .json<{ skipIdentity?: boolean; dryRun?: boolean } & Record<string, unknown>>()
    .catch(() => ({ skipIdentity: undefined, dryRun: undefined }))) as {
    skipIdentity?: boolean;
    dryRun?: boolean;
  } & Record<string, unknown>;

  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const authErr = await verifyDeployControl(
    "run-pipeline",
    id,
    agent.ownerWallet,
    body,
  );
  if (authErr) return c.json({ error: authErr }, 401);

  if (body.skipIdentity) {
    return c.json(
      {
        error: "SKIP_IDENTITY_DISABLED",
        message:
          "Agent ID verification is required. Vouch at /issue with your wallet before play.",
      },
      400,
    );
  }

  const runnable: DeployStatus[] = ["provisioning", "failed", "awaiting_vouch"];
  if (!runnable.includes(agent.status as DeployStatus)) {
    return c.json({ error: "INVALID_STATUS", status: agent.status }, 409);
  }

  if (runningPipelines.has(id)) {
    return c.json({ error: "PIPELINE_ALREADY_RUNNING" }, 409);
  }

  const primarySkill = agent.skills[0];
  if (!primarySkill) {
    return c.json({ error: "NO_SKILLS" }, 400);
  }

  void scheduleDeployPipeline(id, agent, {
    skipIdentity: false,
    dryRun: body.dryRun,
  }).catch(() => undefined);

  return c.json({ accepted: true, deployId: id }, 202);
});

app.post("/deploy/:id/heartbeat", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);

  const agent = await getDeployedAgent(c.req.param("id"));
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const updated = await recordHeartbeat(c.req.param("id"));
  return c.json({ ok: true, lastHeartbeatAt: updated.lastHeartbeatAt });
});

app.post("/deploy/:id/activity", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);

  const id = c.req.param("id");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{
    type?: string;
    matchId?: string;
    gameType?: number;
    wagerGs?: number;
    result?: "won" | "lost" | "unresolved";
    mode?: "offchain" | "onchain";
    at?: string;
    priceGs?: number;
    txHash?: string;
    message?: string;
  }>();

  if (body.type === "match") {
    if (!body.matchId || !body.result || body.gameType == null) {
      return c.json({ error: "INVALID_MATCH" }, 400);
    }
    await recordDeployMatch(id, {
      matchId: body.matchId,
      gameType: body.gameType,
      wagerGs: Number(body.wagerGs ?? 0),
      result: body.result,
      mode: body.mode ?? "offchain",
      at: body.at ?? new Date().toISOString(),
    });
    return c.json({ ok: true });
  }

  if (body.type === "refill") {
    if (!body.txHash || body.priceGs == null) {
      return c.json({ error: "INVALID_REFILL" }, 400);
    }
    await recordDeployRefill(id, {
      priceGs: Number(body.priceGs),
      txHash: body.txHash,
      at: body.at ?? new Date().toISOString(),
    });
    return c.json({ ok: true });
  }

  if (body.type === "log") {
    if (!body.message?.trim()) return c.json({ error: "INVALID_LOG" }, 400);
    await appendDeployLogLine(id, body.message, body.at);
    return c.json({ ok: true });
  }

  return c.json({ error: "UNKNOWN_TYPE" }, 400);
});

app.post("/deploy/:id/stop", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const authErr = await verifyDeployControl("pause", id, agent.ownerWallet, body);
  if (authErr) return c.json({ error: authErr }, 401);

  if (agent.pm2Name) {
    try {
      stopDeployedAgent(id);
    } catch (err) {
      console.warn(`[host] pm2 stop failed for ${id}:`, err);
    }
  }

  const updated = await updateDeployedAgent(id, { status: "paused" });
  return c.json({ agent: updated });
});

app.post("/deploy/:id/start", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const authErr = await verifyDeployControl("resume", id, agent.ownerWallet, body);
  if (authErr) return c.json({ error: authErr }, 401);

  if (!agent.pm2Name) {
    return c.json({ error: "NOT_PROVISIONED" }, 409);
  }

  if (runningPipelines.has(id)) {
    return c.json({ error: "PIPELINE_ALREADY_RUNNING" }, 409);
  }

  loadRuntimeEnv();
  let config;
  try {
    config = getRuntimeConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: "HOST_CONFIG", message }, 500);
  }

  try {
    if (agent.agentAddress && agent.ownerWallet) {
      await assertOwnerVouchedForAgent(
        config,
        agent.agentAddress as `0x${string}`,
        agent.ownerWallet as `0x${string}`,
      );
    }
    startDeployedAgent(config, id);
    const updated = await updateDeployedAgent(id, {
      status: "running",
      lastError: null,
      deployedAt: agent.deployedAt ?? new Date(),
    });
    return c.json({ agent: updated });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "AGENT_NOT_PROVISIONED") {
      const message = err instanceof Error ? err.message : String(err);
      const notVerified =
        message.includes("not attested") ||
        message.includes("bond insufficient") ||
        message.includes("verification is required") ||
        message.includes("Agent ID") ||
        message.includes("/issue") ||
        message.includes("operator");
      return c.json(
        { error: notVerified ? "AGENT_NOT_VERIFIED" : "PM2_START_FAILED", message },
        notVerified ? 403 : 500,
      );
    }

    if (!agent.agentAddress || agent.walletDerivationIndex == null) {
      return c.json(
        {
          error: "NOT_PROVISIONED",
          message: "Agent was never provisioned on this host.",
        },
        409,
      );
    }

    void scheduleDeployPipeline(id, agent, { skipIdentity: false }).catch(() => undefined);
    await updateDeployedAgent(id, { status: "provisioning", lastError: null });
    return c.json({ accepted: true, reprovisioning: true, deployId: id }, 202);
  }
});

app.post("/deploy/:id/baseline", async (c) => {
  const id = c.req.param("id");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{ balanceGs?: number } & Record<string, unknown>>();
  const authErr = await verifyDeployControl("baseline", id, agent.ownerWallet, body);
  if (authErr) return c.json({ error: authErr }, 401);

  const balanceGs = body.balanceGs;
  if (balanceGs == null || !Number.isFinite(balanceGs) || balanceGs < 0) {
    return c.json({ error: "balanceGs must be a non-negative number" }, 400);
  }

  loadRuntimeEnv();
  const config = getRuntimeConfig();
  setDeployBaselineBalance({
    agentsRoot: config.agentsRoot,
    deployId: id,
    balanceGs,
  });

  const skillConfig = parseDeployConfiguration(agent);
  skillConfig.BASELINE_GS = String(balanceGs);
  await updateDeployedAgent(id, {
    configuration: JSON.stringify(skillConfig),
  });

  return c.json({ ok: true, balanceGs });
});

console.log(`[host] listening on :${HOST_PORT}`);
serve({ fetch: app.fetch, port: HOST_PORT });
