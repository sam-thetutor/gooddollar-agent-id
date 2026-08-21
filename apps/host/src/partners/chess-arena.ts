import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  appendDeployLogLine,
  findChessArenaSkillInstall,
  getActiveArenaMatchId,
  getDeployLiveMatch,
  getDeployedAgent,
  listChessArenaAgentRegistry,
  listChessArenaDeploysForOwner,
  lookupChessArenaAgentRegistry,
  parseDeployConfiguration,
  patchSkillInstallConfiguration,
  primarySkillInstall,
  recordDeployMatch,
  resolveSkillConfiguration,
  setActiveArenaMatchId,
  setDeployLiveMatch,
  updateDeployedAgent,
} from "@goodagent/db";
import {
  applyDeployConfiguration,
  chessArenaSkillDir,
  getRuntimeConfig,
  loadRuntimeEnv,
  playChessArenaMatchOnce,
  pm2ProcessName,
  pm2ProcessSnapshot,
  stopDeployedAgent,
  type DeployAgentRecord,
} from "@goodagent/runtime";
import {
  CHESS_ARENA_DEFAULT_URL,
  CHESS_ARENA_SKILL_ID,
  chessArenaLiveWatchUrl,
  chessArenaPartnerSettingsSchema,
  isChessArenaMatchId,
  parseChessArenaTournamentId,
  pickChessArenaPartnerConfiguration,
  sanitizeChessArenaPartnerConfiguration,
} from "@goodagent/shared";
import type { Context, Hono } from "hono";
import { verifyDeployControl } from "../deploy-control-auth.js";

const OWNER_WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

type DeployAgent = NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>;

export interface ChessArenaPartnerHostContext {
  publicHostBase: string;
  fetchVerifyStatus: (
    agentAddress: string,
  ) => Promise<{
    valid?: boolean;
    agentProven?: boolean;
    operator?: string;
    reason?: string;
  } | null>;
}

export interface ChessArenaPartnerAgent {
  deployId: string;
  displayName: string;
  agentAddress: string | null;
  ownerWallet: string | null;
  status: string;
  verified: boolean;
  readyToPlay: boolean;
  dailyCapReached: boolean;
  matchesToday: number | null;
  dailyMatchCap: number | null;
  activeMatchId: string | null;
  livePhase: "starting" | "playing" | null;
  liveWatchUrl: string | null;
  pollUrl: string | null;
  configuration: Record<string, string>;
}

interface ChessArenaStateFile {
  day?: string;
  matchesToday?: number;
}

function parseOwnerWallet(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !OWNER_WALLET_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function parseAgentAddress(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !OWNER_WALLET_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function partnerKeyConfigured(): boolean {
  return Boolean(process.env.CHESS_ARENA_PARTNER_API_KEY?.trim());
}

function verifyPartnerKey(headerValue: string | undefined): boolean {
  const expected = process.env.CHESS_ARENA_PARTNER_API_KEY?.trim();
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

function readChessArenaState(
  agentsRoot: string,
  deployId: string,
): ChessArenaStateFile | null {
  const statePath = resolve(chessArenaSkillDir(agentsRoot, deployId), "state.json");
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as ChessArenaStateFile;
  } catch {
    return null;
  }
}

function readPartnerDailyCap(
  agentsRoot: string,
  deployId: string,
  configuration: Record<string, string>,
): {
  dailyCapReached: boolean;
  matchesToday: number | null;
  dailyMatchCap: number | null;
} {
  const dailyMatchCap = Number(configuration.DAILY_MATCH_CAP ?? 20);
  const state = readChessArenaState(agentsRoot, deployId);
  const day = new Date().toISOString().slice(0, 10);
  const matchesToday =
    state?.day === day ? (state.matchesToday ?? 0) : 0;
  const dailyCapReached =
    Number.isFinite(dailyMatchCap) &&
    dailyMatchCap > 0 &&
    matchesToday >= dailyMatchCap;
  return {
    dailyCapReached,
    matchesToday,
    dailyMatchCap: Number.isFinite(dailyMatchCap) ? dailyMatchCap : null,
  };
}

function resolveArenaUrl(configuration: Record<string, string>): string {
  return (
    configuration.ARENA_URL?.trim() ||
    process.env.CHESS_ARENA_URL?.trim() ||
    CHESS_ARENA_DEFAULT_URL
  ).replace(/\/$/, "");
}

function livePollUrl(ctx: ChessArenaPartnerHostContext, deployId: string): string {
  return `${ctx.publicHostBase}/partners/chess-arena/agents/${encodeURIComponent(deployId)}`;
}

async function clearPartnerPlayLiveState(deployId: string): Promise<void> {
  await setActiveArenaMatchId(deployId, null);
  await setDeployLiveMatch(deployId, null);
}

async function isPartnerPlayBusy(deployId: string): Promise<boolean> {
  const [liveMatch, activeId] = await Promise.all([
    getDeployLiveMatch(deployId),
    getActiveArenaMatchId(deployId),
  ]);
  if (!activeId) return false;
  return (
    liveMatch?.matchId === activeId &&
    (liveMatch.phase === "starting" || liveMatch.phase === "playing")
  );
}

async function stopPartnerAutopilot(agent: DeployAgent): Promise<void> {
  if (agent.status === "running") {
    const snap = pm2ProcessSnapshot(pm2ProcessName(agent.id));
    if (snap?.online) {
      try {
        stopDeployedAgent(agent.id);
      } catch (err) {
        console.warn(`[host] chess-arena partner stop pm2 for ${agent.id}:`, err);
      }
    }
    await updateDeployedAgent(agent.id, { status: "paused" });
  }
  await clearPartnerPlayLiveState(agent.id);
}

function resolvePartnerConfiguration(agent: DeployAgent): Record<string, string> {
  const install = findChessArenaSkillInstall(agent.skills);
  if (!install) return parseDeployConfiguration(agent);
  return resolveSkillConfiguration(agent, install);
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

async function applyPartnerSkillConfiguration(
  agent: DeployAgent,
  sanitized: Record<string, string>,
) {
  loadRuntimeEnv();
  const runtimeConfig = getRuntimeConfig();
  const { merged, skillId, restarted } = await applyDeployConfiguration(
    runtimeConfig,
    toDeployAgentRecord(agent),
    sanitized,
    CHESS_ARENA_SKILL_ID,
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

async function buildPartnerAgentSnapshot(
  agent: DeployAgent,
  ctx: ChessArenaPartnerHostContext,
  verify: { valid?: boolean; agentProven?: boolean } | null,
): Promise<ChessArenaPartnerAgent> {
  loadRuntimeEnv();
  const runtimeConfig = getRuntimeConfig();
  const configuration = resolvePartnerConfiguration(agent);
  const dailyCap = readPartnerDailyCap(
    runtimeConfig.agentsRoot,
    agent.id,
    configuration,
  );
  const install = findChessArenaSkillInstall(agent.skills);
  const provisioned = Boolean(agent.agentAddress && agent.pm2Name);
  const skillInstalled = install?.status === "installed";
  const verified = Boolean(verify?.valid && verify?.agentProven);
  const baseReady = verified && provisioned && skillInstalled;
  const arenaUrl = resolveArenaUrl(configuration);

  const [liveMatch, activeMatchId] = await Promise.all([
    getDeployLiveMatch(agent.id),
    getActiveArenaMatchId(agent.id),
  ]);

  let livePhase: "starting" | "playing" | null = null;
  let activeId = activeMatchId;
  if (liveMatch?.phase === "starting" || liveMatch?.phase === "playing") {
    livePhase = liveMatch.phase;
    activeId = liveMatch.matchId ?? activeMatchId;
  }

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
    activeMatchId: activeId,
    livePhase,
    liveWatchUrl: activeId ? chessArenaLiveWatchUrl(arenaUrl, activeId) : null,
    pollUrl: livePollUrl(ctx, agent.id),
    configuration: pickChessArenaPartnerConfiguration(configuration),
  };
}

function partnerSettingsPayload(
  agent: DeployAgent,
  verify: { valid?: boolean; agentProven?: boolean } | null,
) {
  const install = findChessArenaSkillInstall(agent.skills);
  const raw = install
    ? resolveSkillConfiguration(agent, install)
    : parseDeployConfiguration(agent);
  const verified = Boolean(verify?.valid && verify?.agentProven);
  return {
    deployId: agent.id,
    ownerWallet: agent.ownerWallet,
    verified,
    configuration: pickChessArenaPartnerConfiguration(raw),
  };
}

async function ensureAgentPlayReady(
  agent: DeployAgent,
  ctx: ChessArenaPartnerHostContext,
) {
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

  const verify = await ctx.fetchVerifyStatus(agent.agentAddress);
  if (!verify?.valid || !verify?.agentProven) {
    const message =
      verify?.reason === "not_found"
        ? "Vouch for this agent at /issue using your GoodDollar-verified wallet."
        : `Agent ID is not valid (${verify?.reason ?? "unknown"}). Complete /issue with your wallet.`;
    return {
      error: "AGENT_NOT_VERIFIED" as const,
      status: 403 as const,
      message,
    };
  }

  if (verify.operator?.toLowerCase() !== agent.ownerWallet.toLowerCase()) {
    return {
      error: "AGENT_NOT_VERIFIED" as const,
      status: 403 as const,
      message:
        "The Agent ID must be issued from your owner wallet — reconnect with the same wallet you used to deploy and vouch.",
    };
  }

  const install = findChessArenaSkillInstall(agent.skills);
  if (install?.status !== "installed") {
    return {
      error: "SKILL_NOT_INSTALLED" as const,
      status: 409 as const,
      message: "Chess Puzzle Arena skill is not installed for this deploy.",
    };
  }

  return null;
}

async function resolvePartnerAgentByDeployId(deployId: string) {
  const agent = await getDeployedAgent(deployId);
  if (!agent || !findChessArenaSkillInstall(agent.skills)) return null;
  return agent;
}

async function resolveOwnerPartnerAgent(
  ownerWallet: string,
  deployId?: string,
): Promise<
  | { agent: DeployAgent }
  | { error: string; status: number; body?: Record<string, unknown> }
> {
  if (deployId) {
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) {
      return { error: "NOT_FOUND", status: 404 };
    }
    if (agent.ownerWallet?.toLowerCase() !== ownerWallet) {
      return { error: "NOT_FOUND", status: 404 };
    }
    return { agent };
  }

  const agents = await listChessArenaDeploysForOwner(ownerWallet);
  if (agents.length === 0) {
    return { error: "NO_AGENT", status: 404, body: { error: "NO_AGENT", owner: ownerWallet } };
  }
  if (agents.length > 1) {
    return {
      error: "DEPLOY_ID_REQUIRED",
      status: 400,
      body: {
        error: "DEPLOY_ID_REQUIRED",
        message: "Multiple Chess Arena agents found — pass deployId in the request body.",
        agents: agents.map((a) => ({
          deployId: a.id,
          displayName: a.displayName,
          status: a.status,
        })),
      },
    };
  }
  return { agent: agents[0]! };
}

async function buildPartnerAgentSnapshots(
  agents: DeployAgent[],
  ctx: ChessArenaPartnerHostContext,
): Promise<ChessArenaPartnerAgent[]> {
  return Promise.all(
    agents.map(async (agent) => {
      const verify = agent.agentAddress
        ? await ctx.fetchVerifyStatus(agent.agentAddress)
        : null;
      return buildPartnerAgentSnapshot(agent, ctx, verify);
    }),
  );
}

async function handleRecordMatch(agent: DeployAgent, c: Context) {
  const body = (await c.req.json<{
    matchId?: string;
    result?: "won" | "lost";
    puzzlesSolved?: number;
    ratingSum?: number;
    at?: string;
  } & Record<string, unknown>>());

  const authErr = await verifyDeployControl(
    "play",
    agent.id,
    agent.ownerWallet,
    body,
  );
  if (authErr) return c.json({ error: authErr }, 401);

  if (!body.matchId || !body.result) {
    return c.json({ error: "matchId and result required" }, 400);
  }
  if (!isChessArenaMatchId(body.matchId)) {
    return c.json({ error: "INVALID_MATCH_ID" }, 400);
  }

  const skillInstall = findChessArenaSkillInstall(agent.skills);
  const skillId = skillInstall?.skillId ?? null;
  const at = typeof body.at === "string" ? body.at : new Date().toISOString();
  const tournamentId = parseChessArenaTournamentId(body.matchId);

  await recordDeployMatch(
    agent.id,
    {
      matchId: body.matchId,
      gameType: 0,
      wagerGs: 0,
      result: body.result,
      mode: "onchain",
      at,
    },
    skillId,
  );

  const solved = body.puzzlesSolved ?? "?";
  const rating = body.ratingSum ?? "?";
  const line =
    body.result === "won"
      ? `[match ${body.matchId}] WON · ${solved} puzzles · ratingSum ${rating}`
      : `[match ${body.matchId}] lost · ${solved} puzzles · ratingSum ${rating}`;
  await appendDeployLogLine(agent.id, line, at, skillId);

  await clearPartnerPlayLiveState(agent.id);

  return c.json({
    ok: true,
    deployId: agent.id,
    matchId: body.matchId,
    tournamentId,
  });
}

export function registerChessArenaPartnerRoutes(
  app: Hono,
  ctx: ChessArenaPartnerHostContext,
): void {
  app.get("/partners/chess-arena/settings/schema", (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);
    return c.json(chessArenaPartnerSettingsSchema());
  });

  app.get("/partners/chess-arena/agents", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const agents = await listChessArenaDeploysForOwner(ownerWallet);
    if (agents.length === 0) {
      return c.json({ owner: ownerWallet, agents: [] });
    }

    const snapshots = await buildPartnerAgentSnapshots(agents, ctx);
    return c.json({ owner: ownerWallet, agents: snapshots });
  });

  app.get("/partners/chess-arena/agents/:deployId", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const deployId = c.req.param("deployId");
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const verify = agent.agentAddress
      ? await ctx.fetchVerifyStatus(agent.agentAddress)
      : null;
    const snapshot = await buildPartnerAgentSnapshot(agent, ctx, verify);
    return c.json(snapshot);
  });

  app.get("/partners/chess-arena/settings", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const resolved = await resolveOwnerPartnerAgent(ownerWallet);
    if ("error" in resolved) {
      return c.json(
        resolved.body ?? { error: resolved.error, owner: ownerWallet },
        resolved.status as 400 | 404,
      );
    }

    const verify = resolved.agent.agentAddress
      ? await ctx.fetchVerifyStatus(resolved.agent.agentAddress)
      : null;
    return c.json({
      owner: ownerWallet,
      ...partnerSettingsPayload(resolved.agent, verify),
    });
  });

  app.get("/partners/chess-arena/agents/:deployId/settings", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const agent = await resolvePartnerAgentByDeployId(c.req.param("deployId"));
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const verify = agent.agentAddress
      ? await ctx.fetchVerifyStatus(agent.agentAddress)
      : null;
    return c.json(partnerSettingsPayload(agent, verify));
  });

  app.patch("/partners/chess-arena/settings", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const body = await c.req.json<{
      configuration?: Record<string, unknown>;
      deployId?: string;
    } & Record<string, unknown>>();

    const deployId =
      typeof body.deployId === "string" ? body.deployId.trim() : "";
    const resolved = await resolveOwnerPartnerAgent(ownerWallet, deployId || undefined);
    if ("error" in resolved) {
      return c.json(
        resolved.body ?? { error: resolved.error, owner: ownerWallet },
        resolved.status as 400 | 404,
      );
    }

    const authErr = await verifyDeployControl(
      "configuration",
      resolved.agent.id,
      resolved.agent.ownerWallet,
      body,
    );
    if (authErr) return c.json({ error: authErr }, 401);

    const patch = body.configuration;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return c.json({ error: "configuration object required" }, 400);
    }

    const sanitized = sanitizeChessArenaPartnerConfiguration(patch);
    if (!Object.keys(sanitized).length) {
      return c.json({ error: "configuration must include at least one field" }, 400);
    }

    try {
      const { merged, restarted } = await applyPartnerSkillConfiguration(
        resolved.agent,
        sanitized,
      );
      return c.json({
        owner: ownerWallet,
        deployId: resolved.agent.id,
        configuration: pickChessArenaPartnerConfiguration(merged),
        restarted,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "CONFIG_APPLY_FAILED", message }, 500);
    }
  });

  app.patch("/partners/chess-arena/agents/:deployId/settings", async (c) => {
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

    const sanitized = sanitizeChessArenaPartnerConfiguration(patch);
    if (!Object.keys(sanitized).length) {
      return c.json({ error: "configuration must include at least one field" }, 400);
    }

    try {
      const { merged, restarted } = await applyPartnerSkillConfiguration(
        agent,
        sanitized,
      );
      return c.json({
        deployId,
        configuration: pickChessArenaPartnerConfiguration(merged),
        restarted,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "CONFIG_APPLY_FAILED", message }, 500);
    }
  });

  async function handlePartnerPlay(agent: DeployAgent, c: Context) {
    const readyErr = await ensureAgentPlayReady(agent, ctx);
    if (readyErr) {
      return c.json(
        { error: readyErr.error, message: readyErr.message },
        readyErr.status as 400 | 403 | 409,
      );
    }

    loadRuntimeEnv();
    const runtimeConfig = getRuntimeConfig();
    const configuration = resolvePartnerConfiguration(agent);
    const arenaUrl = resolveArenaUrl(configuration);
    const dailyCap = readPartnerDailyCap(
      runtimeConfig.agentsRoot,
      agent.id,
      configuration,
    );

    if (dailyCap.dailyCapReached) {
      const verify = agent.agentAddress
        ? await ctx.fetchVerifyStatus(agent.agentAddress)
        : null;
      const snapshot = await buildPartnerAgentSnapshot(agent, ctx, verify);
      return c.json(
        {
          error: "DAILY_CAP_REACHED",
          message: `Agent has played ${snapshot.matchesToday ?? "?"} of ${snapshot.dailyMatchCap ?? "?"} matches today.`,
          ...snapshot,
        },
        409,
      );
    }

    if (await isPartnerPlayBusy(agent.id)) {
      const verify = agent.agentAddress
        ? await ctx.fetchVerifyStatus(agent.agentAddress)
        : null;
      const snapshot = await buildPartnerAgentSnapshot(agent, ctx, verify);
      return c.json(
        {
          error: "AGENT_BUSY",
          message: "Agent is already in a match.",
          ...snapshot,
        },
        409,
      );
    }

    await stopPartnerAutopilot(agent);

    const playResult = await playChessArenaMatchOnce(
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

    const now = new Date().toISOString();
    await Promise.all([
      setActiveArenaMatchId(agent.id, playResult.matchId),
      setDeployLiveMatch(agent.id, {
        matchId: playResult.matchId,
        phase: "starting",
        updatedAt: now,
      }),
    ]);

    const tournamentId = parseChessArenaTournamentId(playResult.matchId);
    const liveWatchUrl = chessArenaLiveWatchUrl(arenaUrl, playResult.matchId);

    return c.json({
      deployId: agent.id,
      agentAddress: agent.agentAddress,
      matchId: playResult.matchId,
      tournamentId,
      livePhase: "starting" as const,
      liveWatchUrl,
      pollUrl: livePollUrl(ctx, agent.id),
    });
  }

  app.post("/partners/chess-arena/play", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const body = (await c.req
      .json<Record<string, unknown>>()
      .catch(() => ({}))) as Record<string, unknown>;
    const deployId =
      typeof body.deployId === "string" ? body.deployId.trim() : "";

    const resolved = await resolveOwnerPartnerAgent(ownerWallet, deployId || undefined);
    if ("error" in resolved) {
      return c.json(
        resolved.body ?? { error: resolved.error, owner: ownerWallet },
        resolved.status as 400 | 404,
      );
    }

    const authErr = await verifyDeployControl(
      "play",
      resolved.agent.id,
      resolved.agent.ownerWallet,
      body,
    );
    if (authErr) return c.json({ error: authErr }, 401);

    return handlePartnerPlay(resolved.agent, c);
  });

  app.post("/partners/chess-arena/agents/:deployId/play", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const deployId = c.req.param("deployId");
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    const body = (await c.req
      .json<Record<string, unknown>>()
      .catch(() => ({}))) as Record<string, unknown>;
    const authErr = await verifyDeployControl(
      "play",
      deployId,
      agent.ownerWallet,
      body,
    );
    if (authErr) return c.json({ error: authErr }, 401);

    return handlePartnerPlay(agent, c);
  });

  app.get("/partners/chess-arena/live", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const deployId = c.req.query("deployId")?.trim();
    if (deployId) {
      const agent = await resolvePartnerAgentByDeployId(deployId);
      if (!agent || agent.ownerWallet?.toLowerCase() !== ownerWallet) {
        return c.json({ error: "NOT_FOUND" }, 404);
      }
      const verify = agent.agentAddress
        ? await ctx.fetchVerifyStatus(agent.agentAddress)
        : null;
      const snapshot = await buildPartnerAgentSnapshot(agent, ctx, verify);
      return c.json({
        owner: ownerWallet,
        deployId: snapshot.deployId,
        activeMatchId: snapshot.activeMatchId,
        livePhase: snapshot.livePhase,
        liveWatchUrl: snapshot.liveWatchUrl,
        pollUrl: snapshot.pollUrl,
      });
    }

    const agents = await listChessArenaDeploysForOwner(ownerWallet);
    if (agents.length === 0) {
      return c.json({ error: "NO_AGENT", owner: ownerWallet }, 404);
    }

    const snapshots = await buildPartnerAgentSnapshots(agents, ctx);
    return c.json({
      owner: ownerWallet,
      agents: snapshots.map((snapshot) => ({
        deployId: snapshot.deployId,
        displayName: snapshot.displayName,
        activeMatchId: snapshot.activeMatchId,
        livePhase: snapshot.livePhase,
        liveWatchUrl: snapshot.liveWatchUrl,
        pollUrl: snapshot.pollUrl,
      })),
    });
  });

  app.post("/partners/chess-arena/agents/:deployId/record-match", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const deployId = c.req.param("deployId");
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    return handleRecordMatch(agent, c);
  });

  /** Public agent registry for Chess Puzzle Arena leaderboard / bot detection. */
  app.get("/partners/chess-arena/agent-addresses", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const pageSize = Math.min(
      500,
      Math.max(1, Number(c.req.query("pageSize") ?? 100) || 100),
    );
    const verifiedOnly = c.req.query("verified") === "1";

    const { rows, total } = await listChessArenaAgentRegistry({
      page,
      pageSize,
      verifiedOnly,
    });

    return c.json({
      page,
      pageSize,
      total,
      agents: rows.map((row) => ({
        agentAddress: row.agentAddress,
        deployId: row.deployId,
        displayName: row.displayName,
        ownerWallet: row.ownerWallet,
        status: row.status,
        verified: row.verified,
        deployedAt: row.deployedAt?.toISOString() ?? null,
      })),
    });
  });

  app.get("/partners/chess-arena/is-agent", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const address = parseAgentAddress(c.req.query("address"));
    if (!address) {
      return c.json({ error: "address query param required (0x…)" }, 400);
    }

    const entry = await lookupChessArenaAgentRegistry(address);
    if (!entry) {
      return c.json({ isAgent: false, agentAddress: address });
    }

    return c.json({
      isAgent: true,
      agentAddress: entry.agentAddress,
      deployId: entry.deployId,
      displayName: entry.displayName,
      ownerWallet: entry.ownerWallet,
      status: entry.status,
      verified: entry.verified,
      deployedAt: entry.deployedAt?.toISOString() ?? null,
    });
  });
}
