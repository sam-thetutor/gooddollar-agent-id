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
  type DeployStatus,
} from "@goodagent/db";
import {
  fetchSkillsRegistry,
  findRegistrySkill,
  getDeployStats,
  getRuntimeConfig,
  loadRuntimeEnv,
  pm2ProcessSnapshot,
  restartDeployedAgent,
  runDeployPipeline,
  stopDeployedAgent,
  setDeployBaselineBalance,
  type PipelineStatus,
} from "@goodagent/runtime";
import { Hono } from "hono";
import { cors } from "hono/cors";

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "../../../.env");
loadEnv({ path: existsSync(rootEnv) ? rootEnv : undefined });

const HOST_PORT = Number(process.env.HOST_PORT ?? 3002);
const HOST_INTERNAL_SECRET = process.env.HOST_INTERNAL_SECRET?.trim() ?? "";
const API_BASE = process.env.API_BASE ?? "https://gcopilot-api.geinz.lol";
const DEV_SKIP_PAYMENT = process.env.HOST_DEV_SKIP_PAYMENT === "1";

const app = new Hono();
const runningPipelines = new Set<string>();

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

function publicAgent<T extends { telegramBotTokenEnc?: string | null }>(
  agent: T,
): Omit<T, "telegramBotTokenEnc"> {
  const { telegramBotTokenEnc: _, ...rest } = agent;
  return rest;
}

async function fetchVerifyStatus(agentAddress: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${API_BASE}/agent/verify/${agentAddress}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
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
    .json<{ skipIdentity?: boolean; dryRun?: boolean }>()
    .catch(() => ({ skipIdentity: undefined, dryRun: undefined }))) as {
    skipIdentity?: boolean;
    dryRun?: boolean;
  };

  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const runnable: DeployStatus[] = ["provisioning", "failed"];
  if (agent.status === "provisioning" && !runningPipelines.has(id)) {
    // Allow retry when a prior run died before updating status.
    runnable.push("provisioning");
  }
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

  runningPipelines.add(id);
  void (async () => {
    try {
      loadRuntimeEnv();
      let config;
      try {
        config = getRuntimeConfig();
      } catch (cfgErr) {
        const message = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
        await updateDeployedAgent(id, { status: "failed", lastError: message });
        throw cfgErr;
      }
      const minDerivationIndex = await maxWalletDerivationIndex();
      await runDeployPipeline(
        config,
        {
          deployId: id,
          displayName: agent.displayName,
          template: agent.template,
          skillId: primarySkill.skillId,
          skillConfiguration: parseDeployConfiguration(agent),
          skipIdentity: body.skipIdentity,
          dryRun: body.dryRun,
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
    } finally {
      runningPipelines.delete(id);
    }
  })();

  return c.json({ accepted: true, deployId: id }, 202);
});

app.post("/deploy/:id/heartbeat", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);

  const agent = await getDeployedAgent(c.req.param("id"));
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const updated = await recordHeartbeat(c.req.param("id"));
  return c.json({ ok: true, lastHeartbeatAt: updated.lastHeartbeatAt });
});

app.post("/deploy/:id/stop", async (c) => {
  const id = c.req.param("id");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

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
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  if (!agent.pm2Name) {
    return c.json({ error: "NOT_PROVISIONED" }, 409);
  }

  try {
    restartDeployedAgent(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: "PM2_START_FAILED", message }, 500);
  }

  const updated = await updateDeployedAgent(id, {
    status: "running",
    lastError: null,
  });
  return c.json({ agent: updated });
});

app.post("/deploy/:id/baseline", async (c) => {
  const id = c.req.param("id");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{ balanceGs?: number }>();
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
