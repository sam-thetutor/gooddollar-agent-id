import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  appendDeployLogLine,
  getDeployedAgent,
  listActionOrderDeploysForOwner,
  getDeployLiveMatch,
  getActiveArenaMatchId,
  setActiveArenaMatchId,
  setDeployLiveMatch,
  parseDeployConfiguration,
  resolveSkillConfiguration,
  updateDeployedAgent,
  findActionOrderSkillInstall,
  recordDeployMatch,
} from "@goodagent/db";
import {
  actionorderSkillDir,
  getRuntimeConfig,
  loadRuntimeEnv,
  playActionOrderMatchOnce,
  pm2ProcessName,
  pm2ProcessSnapshot,
  stopDeployedAgent,
} from "@goodagent/runtime";
import { isActionOrderMatchId } from "@goodagent/shared";
import type { Context, Hono } from "hono";
import { verifyDeployControl } from "../deploy-control-auth.js";

const OWNER_WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

type DeployAgent = NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>;

export interface ActionOrderPartnerHostContext {
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

export interface ActionOrderPartnerAgent {
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
  pollUrl: string | null;
  configuration: Record<string, string>;
}

interface ActionOrderStateFile {
  day?: string;
  matchesToday?: number;
}

function parseOwnerWallet(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !OWNER_WALLET_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function partnerKeyConfigured(): boolean {
  return Boolean(process.env.ACTIONORDER_PARTNER_API_KEY?.trim());
}

function verifyPartnerKey(headerValue: string | undefined): boolean {
  const expected = process.env.ACTIONORDER_PARTNER_API_KEY?.trim();
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

function readActionOrderState(
  agentsRoot: string,
  deployId: string,
): ActionOrderStateFile | null {
  const statePath = resolve(
    actionorderSkillDir(agentsRoot, deployId),
    "state.json",
  );
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as ActionOrderStateFile;
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
  const dailyMatchCap = Number(configuration.DAILY_MATCH_CAP ?? 50);
  const state = readActionOrderState(agentsRoot, deployId);
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

function livePollUrl(ctx: ActionOrderPartnerHostContext, deployId: string): string {
  return `${ctx.publicHostBase}/partners/action-order/agents/${encodeURIComponent(deployId)}`;
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
        console.warn(`[host] action-order partner stop pm2 for ${agent.id}:`, err);
      }
    }
    await updateDeployedAgent(agent.id, { status: "paused" });
  }
  await clearPartnerPlayLiveState(agent.id);
}

function resolvePartnerConfiguration(agent: DeployAgent): Record<string, string> {
  const install = findActionOrderSkillInstall(agent.skills);
  if (!install) return parseDeployConfiguration(agent);
  return resolveSkillConfiguration(agent, install);
}

async function buildPartnerAgentSnapshot(
  agent: DeployAgent,
  ctx: ActionOrderPartnerHostContext,
  verify: { valid?: boolean; agentProven?: boolean } | null,
): Promise<ActionOrderPartnerAgent> {
  loadRuntimeEnv();
  const runtimeConfig = getRuntimeConfig();
  const configuration = resolvePartnerConfiguration(agent);
  const dailyCap = readPartnerDailyCap(
    runtimeConfig.agentsRoot,
    agent.id,
    configuration,
  );
  const install = findActionOrderSkillInstall(agent.skills);
  const provisioned = Boolean(agent.agentAddress && agent.pm2Name);
  const skillInstalled = install?.status === "installed";
  const verified = Boolean(verify?.valid && verify?.agentProven);
  const baseReady = verified && provisioned && skillInstalled;

  const [liveMatch, activeMatchId] = await Promise.all([
    getDeployLiveMatch(agent.id),
    getActiveArenaMatchId(agent.id),
  ]);

  let livePhase: "starting" | "playing" | null = null;
  let activeId = activeMatchId;
  if (
    liveMatch?.phase === "starting" ||
    liveMatch?.phase === "playing"
  ) {
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
    pollUrl: livePollUrl(ctx, agent.id),
    configuration,
  };
}

async function ensureAgentPlayReady(
  agent: DeployAgent,
  ctx: ActionOrderPartnerHostContext,
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

  const install = findActionOrderSkillInstall(agent.skills);
  if (install?.status !== "installed") {
    return {
      error: "SKILL_NOT_INSTALLED" as const,
      status: 409 as const,
      message: "Action Order skill is not installed for this deploy.",
    };
  }

  return null;
}

async function resolvePartnerAgentByDeployId(deployId: string) {
  const agent = await getDeployedAgent(deployId);
  if (!agent || !findActionOrderSkillInstall(agent.skills)) return null;
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

  const agents = await listActionOrderDeploysForOwner(ownerWallet);
  if (agents.length === 0) {
    return { error: "NO_AGENT", status: 404, body: { error: "NO_AGENT", owner: ownerWallet } };
  }
  if (agents.length > 1) {
    return {
      error: "DEPLOY_ID_REQUIRED",
      status: 400,
      body: {
        error: "DEPLOY_ID_REQUIRED",
        message: "Multiple Action Order agents found — pass deployId in the request body.",
        agents: agents.map((a: DeployAgent) => ({
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
  ctx: ActionOrderPartnerHostContext,
): Promise<ActionOrderPartnerAgent[]> {
  return Promise.all(
    agents.map(async (agent) => {
      const verify = agent.agentAddress
        ? await ctx.fetchVerifyStatus(agent.agentAddress)
        : null;
      return buildPartnerAgentSnapshot(agent, ctx, verify);
    }),
  );
}

interface ActionOrderStateFile {
  day?: string;
  matchesToday?: number;
  history?: Array<{
    matchId: string;
    result: "won" | "lost" | "unresolved";
    at: string;
  }>;
}

function appendActionOrderStateFile(
  agentsRoot: string,
  deployId: string,
  rec: { matchId: string; result: "won" | "lost"; at: string },
): void {
  const statePath = resolve(actionorderSkillDir(agentsRoot, deployId), "state.json");
  const day = new Date().toISOString().slice(0, 10);
  let state: ActionOrderStateFile = { day, matchesToday: 0, history: [] };
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, "utf8")) as ActionOrderStateFile;
    } catch {
      /* reset */
    }
  }
  if (state.day !== day) {
    state.day = day;
    state.matchesToday = 0;
  }
  state.matchesToday = (state.matchesToday ?? 0) + 1;
  state.history = [
    ...(state.history ?? []).filter((h) => h.matchId !== rec.matchId),
    rec,
  ].slice(-200);
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function handleRecordMatch(agent: DeployAgent, c: Context) {
  const body = (await c.req.json<{
    matchId?: string;
    result?: "won" | "lost";
    playerRoundsWon?: number;
    opponentRoundsWon?: number;
    pointsEarned?: number;
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
  if (!isActionOrderMatchId(body.matchId)) {
    return c.json({ error: "INVALID_MATCH_ID" }, 400);
  }

  const skillInstall = findActionOrderSkillInstall(agent.skills);
  const skillId = skillInstall?.skillId ?? null;
  const at = typeof body.at === "string" ? body.at : new Date().toISOString();

  await recordDeployMatch(
    agent.id,
    {
      matchId: body.matchId,
      gameType: 0,
      wagerGs: 0,
      result: body.result,
      mode: "offchain",
      at,
    },
    skillId,
  );

  loadRuntimeEnv();
  const runtimeConfig = getRuntimeConfig();
  appendActionOrderStateFile(runtimeConfig.agentsRoot, agent.id, {
    matchId: body.matchId,
    result: body.result,
    at,
  });

  const rounds = `${body.playerRoundsWon ?? "?"}-${body.opponentRoundsWon ?? "?"}`;
  const pts = body.pointsEarned ?? 0;
  const line =
    body.result === "won"
      ? `[match ${body.matchId}] WON ${rounds} · ${pts} pts`
      : `[match ${body.matchId}] lost ${rounds}`;
  await appendDeployLogLine(agent.id, line, at, skillId);

  return c.json({ ok: true, deployId: agent.id, matchId: body.matchId });
}

export function registerActionOrderPartnerRoutes(
  app: Hono,
  ctx: ActionOrderPartnerHostContext,
): void {
  app.get("/partners/action-order/agents", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const ownerWallet = parseOwnerWallet(
      c.req.query("owner") ?? c.req.query("ownerWallet"),
    );
    if (!ownerWallet) {
      return c.json({ error: "owner query param required (0x…)" }, 400);
    }

    const agents = await listActionOrderDeploysForOwner(ownerWallet);
    if (agents.length === 0) {
      return c.json({ owner: ownerWallet, agents: [] });
    }

    const snapshots = await buildPartnerAgentSnapshots(agents, ctx);
    return c.json({ owner: ownerWallet, agents: snapshots });
  });

  app.get("/partners/action-order/agents/:deployId", async (c) => {
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

    const actionOrderUrl =
      configuration.ACTIONORDER_URL?.trim() ||
      process.env.ACTIONORDER_URL?.trim();

    const playResult = await playActionOrderMatchOnce(
      runtimeConfig,
      agent.id,
      agent.displayName,
      actionOrderUrl ? { actionOrderUrl } : undefined,
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

    return c.json({
      deployId: agent.id,
      agentAddress: agent.agentAddress,
      matchId: playResult.matchId,
      livePhase: "starting" as const,
      pollUrl: livePollUrl(ctx, agent.id),
      matchPollUrl: actionOrderUrl
        ? `${actionOrderUrl.replace(/\/$/, "")}/api/match/vshouse/${encodeURIComponent(playResult.matchId)}`
        : null,
    });
  }

  app.post("/partners/action-order/play", async (c) => {
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

  app.post("/partners/action-order/agents/:deployId/play", async (c) => {
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

  app.get("/partners/action-order/live", async (c) => {
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
        pollUrl: snapshot.pollUrl,
      });
    }

    const agents = await listActionOrderDeploysForOwner(ownerWallet);
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
        pollUrl: snapshot.pollUrl,
      })),
    });
  });

  app.post("/partners/action-order/agents/:deployId/record-match", async (c) => {
    const keyErr = requirePartnerKey(c);
    if (keyErr) return c.json({ error: keyErr.error }, keyErr.status);

    const deployId = c.req.param("deployId");
    const agent = await resolvePartnerAgentByDeployId(deployId);
    if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

    return handleRecordMatch(agent, c);
  });
}
