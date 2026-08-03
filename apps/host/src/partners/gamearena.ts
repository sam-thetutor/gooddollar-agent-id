import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getDeployedAgent,
  getFirstGamearenaDeployForOwner,
  getDeployLiveMatch,
  getActiveArenaMatchId,
  parseDeployConfiguration,
  patchSkillInstallConfiguration,
  primarySkillInstall,
  resolveSkillConfiguration,
  updateDeployedAgent,
  findGamearenaSkillInstall,
} from "@goodagent/db";
import { inferLiveMatchFromLogTail } from "@goodagent/live-arena";
import {
  agentDir,
  applyDeployConfiguration,
  assertOwnerVouchedForAgent,
  getRuntimeConfig,
  loadRuntimeEnv,
  playGamearenaMatchOnce,
  pm2ProcessName,
  readGamePassProfile,
  startDeployedAgent,
  stopDeployedAgent,
  pauseGamearenaAgentAtDailyCap,
  isGamearenaDailyCapReached,
  readDailyMatchCap,
  readGamearenaDailyCapState,
  gamearenaSkillDir,
  type DeployAgentRecord,
} from "@goodagent/runtime";
import {
  gamearenaPartnerSettingsSchema,
  pickGamearenaPartnerConfiguration,
  sanitizeGamearenaPartnerConfiguration,
  GAMEARENA_SKILL_ID,
} from "@goodagent/shared";
import type { Context, Hono } from "hono";
import { verifyDeployControl } from "../deploy-control-auth.js";

const OWNER_WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

type DeployAgent = NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>;

export interface GamearenaPartnerHostContext {
  publicHostBase: string;
  apiBase: string;
  fetchVerifyStatus: (
    agentAddress: string,
  ) => Promise<{ valid?: boolean; agentProven?: boolean } | null>;
}

export interface GamearenaPartnerAgent {
  deployId: string;
  displayName: string;
  agentAddress: string | null;
  ownerWallet: string | null;
  gamePassUsername: string | null;
  status: string;
  verified: boolean;
  readyToPlay: boolean;
  dailyCapReached: boolean;
  matchesToday: number | null;
  dailyMatchCap: number | null;
  activeMatchId: string | null;
  livePhase: "starting" | "playing" | null;
  liveWatchUrl: string | null;
}

function resolveLiveArenaFromLog(
  logTail: string | null | undefined,
  displayName: string,
  liveMatch: Awaited<ReturnType<typeof getDeployLiveMatch>>,
  activeArenaMatchId: string | null,
): { liveMatch: Awaited<ReturnType<typeof getDeployLiveMatch>>; activeArenaMatchId: string | null } {
  const inferred = logTail?.trim()
    ? inferLiveMatchFromLogTail(logTail, displayName)
    : null;

  if (inferred?.phase === "starting" || inferred?.phase === "playing") {
    const hostActive =
      liveMatch?.phase === "starting" || liveMatch?.phase === "playing";
    return {
      liveMatch: hostActive ? liveMatch : inferred,
      activeArenaMatchId: activeArenaMatchId ?? inferred.matchId,
    };
  }

  if (liveMatch?.phase === "starting" || liveMatch?.phase === "playing") {
    return { liveMatch, activeArenaMatchId };
  }

  return { liveMatch: null, activeArenaMatchId: null };
}

function readAgentLogTail(
  agentsRoot: string,
  deployId: string,
  lines = 24,
): string | null {
  const logDir = resolve(agentDir(agentsRoot, deployId), "logs");
  const chunks: string[] = [];
  for (const name of ["out.log", "err.log"]) {
    const path = resolve(logDir, name);
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf8").trim();
      if (raw) chunks.push(raw);
    } catch {
      /* ignore */
    }
  }
  if (!chunks.length) return null;
  return chunks.join("\n").split("\n").slice(-lines).join("\n") || null;
}

function gamearenaFirstAgentConflict(existing: {
  id: string;
  displayName: string;
  agentAddress: string | null;
  status: string;
}) {
  return {
    error: "GAMEARENA_FIRST_AGENT_ONLY" as const,
    message:
      "Only the first GameArena deploy for this wallet may be used in the partner API.",
    agent: {
      deployId: existing.id,
      displayName: existing.displayName,
      agentAddress: existing.agentAddress,
      status: existing.status,
    },
  };
}

function partnerKeyConfigured(): boolean {
  return Boolean(process.env.GAMEARENA_PARTNER_API_KEY?.trim());
}

function verifyPartnerKey(headerValue: string | undefined): boolean {
  const expected = process.env.GAMEARENA_PARTNER_API_KEY?.trim();
  if (!expected) return true;
  return headerValue === expected;
}

function readPartnerKey(c: {
  req: { header: (name: string) => string | undefined };
}): string | undefined {
  const direct = c.req.header("x-partner-key")?.trim();
  if (direct) return direct;
  const auth = c.req.header("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return undefined;
}

function requirePartnerKey(c: {
  req: { header: (name: string) => string | undefined };
}) {
  if (!partnerKeyConfigured()) return null;
  const key = readPartnerKey(c);
  if (!verifyPartnerKey(key)) {
    return { error: "INVALID_PARTNER_KEY" as const, status: 401 as const };
  }
  return null;
}

function parseOwnerWallet(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !OWNER_WALLET_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function toDeployAgentRecord(agent: DeployAgent): DeployAgentRecord {
  return {
    id: agent.id,
    displayName: agent.displayName,
    agentAddress: agent.agentAddress,
    walletDerivationIndex: agent.walletDerivationIndex,
    configuration: agent.configuration,
    skills: agent.skills.map((s) => ({
      skillId: s.skillId,
      registryPath: s.registryPath,
      configJson: s.configJson,
      status: s.status,
      id: s.id,
    })),
  };
}

function readPartnerDailyCap(
  agentsRoot: string,
  deployId: string,
): {
  dailyCapReached: boolean;
  matchesToday: number | null;
  dailyMatchCap: number | null;
} {
  const skillDir = gamearenaSkillDir(agentsRoot, deployId);
  if (!existsSync(resolve(skillDir, "package.json"))) {
    return { dailyCapReached: false, matchesToday: null, dailyMatchCap: null };
  }
  const dailyMatchCap = readDailyMatchCap(skillDir);
  const state = readGamearenaDailyCapState(skillDir);
  const matchesToday = state?.matchesToday ?? null;
  const dailyCapReached = isGamearenaDailyCapReached(agentsRoot, deployId);
  return { dailyCapReached, matchesToday, dailyMatchCap };
}

async function buildPartnerAgentSnapshot(
  agent: DeployAgent,
  ctx: GamearenaPartnerHostContext,
  verify: { valid?: boolean; agentProven?: boolean } | null,
  opts?: { skipDailyCapPause?: boolean },
): Promise<GamearenaPartnerAgent> {
  loadRuntimeEnv();
  const runtimeConfig = getRuntimeConfig();
  const config = parseDeployConfiguration(agent);
  let gamePassUsername =
    config.GAME_PASS_USERNAME?.trim() || config.PLAYER_NAME?.trim() || null;

  const logTail = agent.agentAddress
    ? readAgentLogTail(runtimeConfig.agentsRoot, agent.id, 48)
    : null;

  const usernamePromise =
    !gamePassUsername && agent.agentAddress
      ? readGamePassProfile(
          agent.agentAddress as `0x${string}`,
          runtimeConfig.rpcUrl,
        )
          .then((profile) => profile.username || null)
          .catch(() => null)
      : Promise.resolve<string | null>(null);

  const pausePromise =
    !opts?.skipDailyCapPause && agent.status === "running"
      ? pauseGamearenaAgentAtDailyCap(runtimeConfig, agent.id, {
          logTail,
          onPaused: async () => {
            await updateDeployedAgent(agent.id, { status: "paused" });
          },
        })
      : Promise.resolve<
          Awaited<ReturnType<typeof pauseGamearenaAgentAtDailyCap>>
        >({ action: "not_capped" as const });

  const [resolvedUsername, pauseResult, liveMatch, storedMatchId] =
    await Promise.all([
      usernamePromise,
      pausePromise,
      getDeployLiveMatch(agent.id),
      getActiveArenaMatchId(agent.id),
    ]);

  if (resolvedUsername) gamePassUsername = resolvedUsername;
  if (
    pauseResult.action === "paused" ||
    pauseResult.action === "already_stopped"
  ) {
    agent = { ...agent, status: "paused" };
  }

  let activeMatchId: string | null = null;
  let livePhase: GamearenaPartnerAgent["livePhase"] = null;

  if (agent.agentAddress) {
    const resolved = resolveLiveArenaFromLog(
      logTail,
      agent.displayName,
      liveMatch,
      storedMatchId,
    );
    activeMatchId = resolved.activeArenaMatchId;
    if (
      resolved.liveMatch?.phase === "starting" ||
      resolved.liveMatch?.phase === "playing"
    ) {
      livePhase = resolved.liveMatch.phase;
    }
  }

  const verified = Boolean(verify?.valid && verify?.agentProven);
  const provisioned = Boolean(agent.agentAddress && agent.pm2Name);
  const skillInstalled = Boolean(
    findGamearenaSkillInstall(agent.skills)?.status === "installed",
  );
  const dailyCap = readPartnerDailyCap(runtimeConfig.agentsRoot, agent.id);
  const baseReady = verified && provisioned && skillInstalled;

  const liveWatchUrl =
    activeMatchId && livePhase
      ? `${ctx.publicHostBase}/arena/live/${encodeURIComponent(activeMatchId)}`
      : null;

  return {
    deployId: agent.id,
    displayName: agent.displayName,
    agentAddress: agent.agentAddress,
    ownerWallet: agent.ownerWallet,
    gamePassUsername,
    status: agent.status,
    verified,
    readyToPlay: baseReady && !dailyCap.dailyCapReached,
    dailyCapReached: dailyCap.dailyCapReached,
    matchesToday: dailyCap.matchesToday,
    dailyMatchCap: dailyCap.dailyMatchCap,
    activeMatchId,
    livePhase,
    liveWatchUrl,
  };
}

function mergePartnerVerify(
  snapshot: GamearenaPartnerAgent,
  verify: { valid?: boolean; agentProven?: boolean } | null,
  agent: DeployAgent,
): GamearenaPartnerAgent {
  const verified = Boolean(verify?.valid && verify?.agentProven);
  const provisioned = Boolean(agent.agentAddress && agent.pm2Name);
  const skillInstalled = Boolean(
    findGamearenaSkillInstall(agent.skills)?.status === "installed",
  );
  const baseReady = verified && provisioned && skillInstalled;
  return {
    ...snapshot,
    verified,
    readyToPlay: baseReady && !snapshot.dailyCapReached,
  };
}

async function resolveFirstPartnerAgent(ownerWallet: string) {
  return getFirstGamearenaDeployForOwner(ownerWallet);
}

async function resolvePartnerAgentByDeployId(deployId: string) {
  const agent = await getDeployedAgent(deployId);
  if (!agent || !findGamearenaSkillInstall(agent.skills)) return null;
  return agent;
}

async function assertFirstPartnerAgent(
  agent: DeployAgent,
): Promise<{ error: string; status: number; body?: Record<string, unknown> } | null> {
  if (!agent.ownerWallet) {
    return { error: "OWNER_NOT_SET", status: 400 };
  }
  const first = await getFirstGamearenaDeployForOwner(agent.ownerWallet);
  if (first && first.id !== agent.id) {
    return {
      error: "GAMEARENA_FIRST_AGENT_ONLY",
      status: 409,
      body: gamearenaFirstAgentConflict(first),
    };
  }
  return null;
}

async function applyPartnerSkillConfiguration(
  agent: DeployAgent,
  sanitized: Record<string, string>,
) {
  loadRuntimeEnv();
  const runtimeConfig = getRuntimeConfig();
  const { merged, skillId, restarted } = applyDeployConfiguration(
    runtimeConfig,
    toDeployAgentRecord(agent),
    sanitized,
    GAMEARENA_SKILL_ID,
  );
  await patchSkillInstallConfiguration(agent.id, skillId, merged);
  const primary = primarySkillInstall(agent.skills);
  if (primary?.skillId === skillId) {
    await updateDeployedAgent(agent.id, {
      configuration: JSON.stringify(merged),
    });
  }
  return { merged, skillId, restarted };
}

function partnerSettingsPayload(
  agent: DeployAgent,
  verify: { valid?: boolean; agentProven?: boolean } | null,
) {
  const install = findGamearenaSkillInstall(agent.skills);
  const raw = install
    ? resolveSkillConfiguration(agent, install)
    : parseDeployConfiguration(agent);
  const verified = Boolean(verify?.valid && verify?.agentProven);
  const provisioned = Boolean(agent.agentAddress && agent.pm2Name);
  const skillInstalled = install?.status === "installed";
  loadRuntimeEnv();
  const dailyCap = readPartnerDailyCap(getRuntimeConfig().agentsRoot, agent.id);
  const baseReady = verified && provisioned && skillInstalled;

  return {
    deployId: agent.id,
    displayName: agent.displayName,
    agentAddress: agent.agentAddress,
    ownerWallet: agent.ownerWallet,
    status: agent.status,
    verified,
    readyToPlay: baseReady && !dailyCap.dailyCapReached,
    dailyCapReached: dailyCap.dailyCapReached,
    matchesToday: dailyCap.matchesToday,
    dailyMatchCap: dailyCap.dailyMatchCap,
    configuration: pickGamearenaPartnerConfiguration(raw),
  };
}

async function ensureAgentPlayReady(agent: DeployAgent) {
  if (!agent.agentAddress || !agent.pm2Name) {
    return {
      error: "NOT_PROVISIONED" as const,
      status: 409 as const,
      message: "Agent is not fully provisioned on the host.",
    };
  }

  if (!agent.ownerWallet) {
    return { error: "OWNER_NOT_SET" as const, status: 400 as const };
  }

  loadRuntimeEnv();
  const runtimeConfig = getRuntimeConfig();
  try {
    await assertOwnerVouchedForAgent(
      runtimeConfig,
      agent.agentAddress as `0x${string}`,
      agent.ownerWallet as `0x${string}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: "AGENT_NOT_VERIFIED" as const,
      status: 403 as const,
      message,
    };
  }

  const install = findGamearenaSkillInstall(agent.skills);
  if (install?.status !== "installed") {
    return {
      error: "SKILL_NOT_INSTALLED" as const,
      status: 409 as const,
      message: "GameArena skill is not installed for this deploy.",
    };
  }

  return null;
}

function livePollUrl(ctx: GamearenaPartnerHostContext, deployId: string) {
  return `${ctx.publicHostBase}/partners/gamearena/agents/${encodeURIComponent(deployId)}`;
}

export function registerGamearenaPartnerRoutes(
  app: Hono,
  ctx: GamearenaPartnerHostContext,
): void {
  app.get("/partners/gamearena/settings/schema", (c) => {
    return c.json(gamearenaPartnerSettingsSchema());
  });

const partnerReadOpts = { skipDailyCapPause: true } as const;

  app.get("/partners/gamearena/agents", async (c) => {
    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    loadRuntimeEnv();
    const first = await resolveFirstPartnerAgent(ownerWallet);
    if (!first) {
      return c.json({ owner: ownerWallet, agents: [] });
    }

    const [verify, snapshot] = await Promise.all([
      first.agentAddress
        ? ctx.fetchVerifyStatus(first.agentAddress)
        : Promise.resolve(null),
      buildPartnerAgentSnapshot(first, ctx, null, partnerReadOpts),
    ]);
    return c.json({
      owner: ownerWallet,
      agents: [mergePartnerVerify(snapshot, verify, first)],
    });
  });

  app.get("/partners/gamearena/agents/:deployId", async (c) => {
    const deployId = c.req.param("deployId");
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const [verify, snapshot] = await Promise.all([
      agent.agentAddress
        ? ctx.fetchVerifyStatus(agent.agentAddress)
        : Promise.resolve(null),
      buildPartnerAgentSnapshot(agent, ctx, null, partnerReadOpts),
    ]);
    return c.json(mergePartnerVerify(snapshot, verify, agent));
  });

  app.get("/partners/gamearena/settings", async (c) => {
    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const agent = await resolveFirstPartnerAgent(ownerWallet);
    if (!agent) {
      return c.json({ error: "NO_AGENT", owner: ownerWallet }, 404);
    }

    const verify = agent.agentAddress
      ? await ctx.fetchVerifyStatus(agent.agentAddress)
      : null;
    return c.json({
      owner: ownerWallet,
      ...partnerSettingsPayload(agent, verify),
    });
  });

  app.get("/partners/gamearena/agents/:deployId/settings", async (c) => {
    const agent = await resolvePartnerAgentByDeployId(c.req.param("deployId"));
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const verify = agent.agentAddress
      ? await ctx.fetchVerifyStatus(agent.agentAddress)
      : null;
    return c.json(partnerSettingsPayload(agent, verify));
  });

  app.patch("/partners/gamearena/settings", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const agent = await resolveFirstPartnerAgent(ownerWallet);
    if (!agent) {
      return c.json({ error: "NO_AGENT", owner: ownerWallet }, 404);
    }

    const body = await c.req.json<{
      configuration?: Record<string, unknown>;
    } & Record<string, unknown>>();

    const authErr = await verifyDeployControl(
      "configuration",
      agent.id,
      agent.ownerWallet,
      body,
    );
    if (authErr) return c.json({ error: authErr }, 401);

    const patch = body.configuration;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return c.json({ error: "configuration object required" }, 400);
    }

    const sanitized = sanitizeGamearenaPartnerConfiguration(patch);
    if (!Object.keys(sanitized).length) {
      return c.json({ error: "configuration must include at least one field" }, 400);
    }

    const firstErr = await assertFirstPartnerAgent(agent);
    if (firstErr) {
      return c.json(
        firstErr.body ?? { error: firstErr.error },
        firstErr.status as 400 | 409,
      );
    }

    try {
      const { merged, restarted } = await applyPartnerSkillConfiguration(
        agent,
        sanitized,
      );
      return c.json({
        owner: ownerWallet,
        deployId: agent.id,
        configuration: pickGamearenaPartnerConfiguration(merged),
        restarted,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "CONFIG_APPLY_FAILED", message }, 500);
    }
  });

  app.patch("/partners/gamearena/agents/:deployId/settings", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const deployId = c.req.param("deployId");
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const body = await c.req.json<{
      configuration?: Record<string, unknown>;
    } & Record<string, unknown>>();

    const authErr = await verifyDeployControl(
      "configuration",
      deployId,
      agent.ownerWallet,
      body,
    );
    if (authErr) return c.json({ error: authErr }, 401);

    const patch = body.configuration;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return c.json({ error: "configuration object required" }, 400);
    }

    const sanitized = sanitizeGamearenaPartnerConfiguration(patch);
    if (!Object.keys(sanitized).length) {
      return c.json({ error: "configuration must include at least one field" }, 400);
    }

    const firstErr = await assertFirstPartnerAgent(agent);
    if (firstErr) {
      return c.json(
        firstErr.body ?? { error: firstErr.error },
        firstErr.status as 400 | 409,
      );
    }

    try {
      const { merged, restarted } = await applyPartnerSkillConfiguration(
        agent,
        sanitized,
      );
      return c.json({
        deployId,
        configuration: pickGamearenaPartnerConfiguration(merged),
        restarted,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "CONFIG_APPLY_FAILED", message }, 500);
    }
  });

  app.post("/partners/gamearena/agents/:deployId/start", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const deployId = c.req.param("deployId");
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const authErr = await verifyDeployControl("resume", deployId, agent.ownerWallet, body);
    if (authErr) return c.json({ error: authErr }, 401);

    const firstErr = await assertFirstPartnerAgent(agent);
    if (firstErr) {
      return c.json(
        firstErr.body ?? { error: firstErr.error },
        firstErr.status as 400 | 409,
      );
    }

    if (!agent.pm2Name) {
      return c.json({ error: "NOT_PROVISIONED" }, 409);
    }

    const readyErr = await ensureAgentPlayReady(agent);
    if (readyErr) {
      return c.json(
        { error: readyErr.error, message: readyErr.message },
        readyErr.status as 400 | 403 | 409,
      );
    }

    loadRuntimeEnv();
    const runtimeConfig = getRuntimeConfig();
    try {
      startDeployedAgent(runtimeConfig, deployId);
      const updated = await updateDeployedAgent(deployId, {
        status: "running",
        lastError: null,
        deployedAt: agent.deployedAt ?? new Date(),
      });
      return c.json({
        deployId,
        status: updated.status,
        pm2Name: pm2ProcessName(deployId),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "PM2_START_FAILED", message }, 500);
    }
  });

  app.post("/partners/gamearena/agents/:deployId/stop", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const deployId = c.req.param("deployId");
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const authErr = await verifyDeployControl("pause", deployId, agent.ownerWallet, body);
    if (authErr) return c.json({ error: authErr }, 401);

    if (agent.pm2Name) {
      try {
        stopDeployedAgent(deployId);
      } catch (err) {
        console.warn(`[host] partner pm2 stop failed for ${deployId}:`, err);
      }
    }

    const updated = await updateDeployedAgent(deployId, { status: "paused" });
    return c.json({ deployId, status: updated.status });
  });

  async function handlePartnerPlay(agent: DeployAgent, c: Context) {
    const firstErr = await assertFirstPartnerAgent(agent);
    if (firstErr) {
      return c.json(
        firstErr.body ?? { error: firstErr.error },
        firstErr.status as 400 | 409,
      );
    }

    const readyErr = await ensureAgentPlayReady(agent);
    if (readyErr) {
      return c.json(
        { error: readyErr.error, message: readyErr.message },
        readyErr.status as 400 | 403 | 409,
      );
    }

    const [verify, snapshotBase] = await Promise.all([
      agent.agentAddress
        ? ctx.fetchVerifyStatus(agent.agentAddress)
        : Promise.resolve(null),
      buildPartnerAgentSnapshot(agent, ctx, null, partnerReadOpts),
    ]);
    const snapshot = mergePartnerVerify(snapshotBase, verify, agent);
    if (snapshot.livePhase === "starting" || snapshot.livePhase === "playing") {
      return c.json(
        {
          error: "AGENT_BUSY",
          message: "Agent is already in a match.",
          ...snapshot,
        },
        409,
      );
    }

    if (snapshot.dailyCapReached) {
      return c.json(
        {
          error: "DAILY_CAP_REACHED",
          message: `Agent has played ${snapshot.matchesToday ?? "?"} of ${snapshot.dailyMatchCap ?? "?"} matches today. Try again after UTC midnight.`,
          ...snapshot,
        },
        409,
      );
    }

    loadRuntimeEnv();
    const runtimeConfig = getRuntimeConfig();

    if (agent.pm2Name && agent.status === "running") {
      try {
        stopDeployedAgent(agent.id);
        await updateDeployedAgent(agent.id, { status: "paused" });
      } catch (err) {
        console.warn(`[host] partner play: stop pm2 before one-shot for ${agent.id}:`, err);
      }
    }

    const playResult = await playGamearenaMatchOnce(
      runtimeConfig,
      agent.id,
      agent.displayName,
    );

    if (!playResult.matchId) {
      return c.json(
        {
          error: playResult.error ?? "PLAY_FAILED",
          deployId: agent.id,
          agentAddress: agent.agentAddress,
          logTail: playResult.logTail,
        },
        502,
      );
    }

    const liveWatchUrl = `${ctx.publicHostBase}/arena/live/${encodeURIComponent(playResult.matchId)}`;
    return c.json({
      deployId: agent.id,
      agentAddress: agent.agentAddress,
      matchId: playResult.matchId,
      livePhase: "starting" as const,
      liveWatchUrl,
      pollUrl: livePollUrl(ctx, agent.id),
    });
  }

  app.post("/partners/gamearena/play", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const agent = await resolveFirstPartnerAgent(ownerWallet);
    if (!agent) {
      return c.json({ error: "NO_AGENT", owner: ownerWallet }, 404);
    }

    const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const authErr = await verifyDeployControl("play", agent.id, agent.ownerWallet, body);
    if (authErr) return c.json({ error: authErr }, 401);

    return handlePartnerPlay(agent, c);
  });

  app.post("/partners/gamearena/agents/:deployId/play", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const deployId = c.req.param("deployId");
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const authErr = await verifyDeployControl("play", deployId, agent.ownerWallet, body);
    if (authErr) return c.json({ error: authErr }, 401);

    return handlePartnerPlay(agent, c);
  });

  app.get("/partners/gamearena/live", async (c) => {
    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const agent = await resolveFirstPartnerAgent(ownerWallet);
    if (!agent) {
      return c.json({ error: "NO_AGENT", owner: ownerWallet }, 404);
    }

    const snapshot = await buildPartnerAgentSnapshot(
      agent,
      ctx,
      null,
      partnerReadOpts,
    );
    return c.json({
      owner: ownerWallet,
      deployId: snapshot.deployId,
      activeMatchId: snapshot.activeMatchId,
      livePhase: snapshot.livePhase,
      liveWatchUrl: snapshot.liveWatchUrl,
    });
  });

  app.get("/partners/gamearena/agents/:deployId/live", async (c) => {
    const agent = await resolvePartnerAgentByDeployId(c.req.param("deployId"));
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const snapshot = await buildPartnerAgentSnapshot(
      agent,
      ctx,
      null,
      partnerReadOpts,
    );
    return c.json({
      deployId: snapshot.deployId,
      activeMatchId: snapshot.activeMatchId,
      livePhase: snapshot.livePhase,
      liveWatchUrl: snapshot.liveWatchUrl,
    });
  });
}
