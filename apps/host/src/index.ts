import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { serve } from "@hono/node-server";
import {
  confirmDeployPayment,
  createDeployedAgent,
  decryptTelegramBotToken,
  getDeployedAgent,
  listActiveSubscribers,
  listChatSubscriptions,
  listDeployedAgentsByOwner,
  listGamearenaDeployedAgents,
  getFirstGamearenaDeployForOwner,
  markReminded,
  maxWalletDerivationIndex,
  parseDeployConfiguration,
  recordClaims,
  recordHeartbeat,
  skipPaymentForDeploy,
  streakLeaderboard,
  subscribeWallet,
  unsubscribeChat,
  unsubscribeWallet,
  deactivateChats,
  updateDeployedAgent,
  patchSkillInstallConfiguration,
  updateSkillInstall,
  resolveSkillConfiguration,
  findGamearenaSkillInstall,
  findEnabledGamearenaSkillInstall,
  primarySkillInstall,
  skillFolderFromRegistryPath,
  recordDeployMatch,
  recordDeployRefill,
  appendDeployLogLine,
  setDeployLiveMatch,
  getDeployLiveMatch,
  setActiveArenaMatchId,
  getActiveArenaMatchId,
  listDeployMatches,
  listDeployMatchesForSkill,
  getDeployLogTail,
  syncGamearenaStateFile,
  syncDeployLogFile,
  type GameArenaLiveMatch,
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
  applyDeployConfiguration,
  applySkillInstallStatus,
  assertOwnerVouchedForAgent,
  buildGamearenaRegistryFromAgents,
  enrichGamearenaLadder,
  fetchGamearenaLadder,
  deriveAgentAccount,
  checkGamePassUsernameForAgent,
  setGamePassUsername,
  syncAgentAfterPassRename,
  agentDir,
  GAMEARENA_SKILL_ID,
  collectDeploySkillStats,
  collectSkillStats,
  pauseGamearenaAgentAtDailyCap,
  patchAllGamearenaDailyCapGuards,
  type SkillStatsSummary,
  type PipelineStatus,
  type DeployAgentRecord,
} from "@goodagent/runtime";
import { inferLiveMatchFromLogTail } from "@goodagent/live-arena";
import {
  isSkillDeployable,
  assertDeploySkillCount,
  GOODAGENT_API_URL,
  GOODAGENT_HOST_URL,
  isActionOrderSkillId,
  isGamearenaMatchId,
  isActionOrderMatchId,
  type RegistrySkillWithDashboard,
} from "@goodagent/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { verifyDeployControl } from "./deploy-control-auth.js";
import {
  registerGamearenaPartnerRoutes,
} from "./partners/gamearena.js";
import {
  registerActionOrderPartnerRoutes,
} from "./partners/actionorder.js";

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "../../../.env");
loadEnv({ path: existsSync(rootEnv) ? rootEnv : undefined, override: true });

const HOST_PORT = Number(process.env.HOST_PORT ?? 3002);
const HOST_INTERNAL_SECRET = process.env.HOST_INTERNAL_SECRET?.trim() ?? "";
const API_BASE = process.env.API_BASE ?? GOODAGENT_API_URL;
/** Loopback verify API on the VPS — avoids nginx round-trip on every partner poll. */
const VERIFY_API_BASE =
  process.env.HOST_VERIFY_API_BASE?.trim()?.replace(/\/$/, "") || API_BASE;
const DEV_SKIP_PAYMENT = process.env.HOST_DEV_SKIP_PAYMENT === "1";
const HOST_PUBLIC_BASE =
  process.env.PUBLIC_HOST_URL?.trim()?.replace(/\/$/, "") || GOODAGENT_HOST_URL;

const app = new Hono();
const runningPipelines = new Set<string>();
const VERIFY_CACHE_MS = 300_000;
type VerifyStatus = {
  valid?: boolean;
  agentProven?: boolean;
  operator?: string;
  reason?: string;
};

const verifyCache = new Map<string, { at: number; data: VerifyStatus }>();

/** Avoid re-syncing large agent log/state files on every dashboard poll. */
const FILE_SYNC_INTERVAL_MS = 60_000;
const lastFileSyncAt = new Map<string, number>();

function scheduleDeployFileSync(
  agentId: string,
  statePath: string | null,
  outLog: string | null,
  skillIds: string[] = [],
  defaultSkillId?: string | null,
): void {
  const now = Date.now();
  const last = lastFileSyncAt.get(agentId) ?? 0;
  if (now - last < FILE_SYNC_INTERVAL_MS) return;
  lastFileSyncAt.set(agentId, now);
  void (async () => {
    if (statePath && existsSync(statePath)) {
      await syncGamearenaStateFile(agentId, statePath).catch(() => undefined);
    }
    if (outLog && existsSync(outLog)) {
      await syncDeployLogFile(agentId, outLog, {
        skillIds,
        defaultSkillId: defaultSkillId ?? null,
      }).catch(() => undefined);
    }
  })();
}

/** When the skill only writes logs (no arena_match posts), infer live state from log tail. */
function resolveLiveArenaFromLog(
  logTail: string | null | undefined,
  displayName: string,
  liveMatch: GameArenaLiveMatch | null,
  activeArenaMatchId: string | null,
): { liveMatch: GameArenaLiveMatch | null; activeArenaMatchId: string | null } {
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

  if (
    liveMatch?.phase === "starting" ||
    liveMatch?.phase === "playing"
  ) {
    return { liveMatch, activeArenaMatchId };
  }

  // Between matches — clear stale ended rows so the next match can subscribe
  return { liveMatch: null, activeArenaMatchId: null };
}

function readAgentLogTail(
  agentsRoot: string,
  deployId: string,
  lines = 24,
): string | null {
  const logDir = resolve(agentDir(agentsRoot, deployId), "logs");
  const candidates = ["out.log", "err.log"];
  const chunks: string[] = [];
  for (const name of candidates) {
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

async function maybePauseGamearenaAtDailyCap(
  agent: {
    id: string;
    status: string;
    skills: Parameters<typeof findEnabledGamearenaSkillInstall>[0];
  },
  logTail?: string | null,
): Promise<void> {
  if (agent.status !== "running") return;
  if (!findEnabledGamearenaSkillInstall(agent.skills)) return;
  loadRuntimeEnv();
  const config = getRuntimeConfig();
  await pauseGamearenaAgentAtDailyCap(config, agent.id, {
    logTail,
    onPaused: async () => {
      await updateDeployedAgent(agent.id, { status: "paused" });
    },
  });
}

async function sweepGamearenaDailyCaps(): Promise<void> {
  try {
    loadRuntimeEnv();
    const agents = await listGamearenaDeployedAgents();
    for (const agent of agents) {
      if (agent.status !== "running") continue;
      await maybePauseGamearenaAtDailyCap(agent);
    }
  } catch (err) {
    console.warn("[host] daily cap sweep failed:", err);
  }
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
      "Only your first GameArena agent can participate. Configure and start that agent from the dashboard.",
    agent: {
      deployId: existing.id,
      displayName: existing.displayName,
      agentAddress: existing.agentAddress,
      status: existing.status,
    },
  };
}

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
  if (!agent.skills.length) {
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
    const telegramBotToken = await decryptTelegramBotToken(
      agent,
      config.encryptionSecret,
    );
    await runDeployPipeline(
      config,
      {
        deployId: id,
        displayName: agent.displayName,
        ownerWallet: agent.ownerWallet as `0x${string}`,
        template: agent.template,
        skills: agent.skills.map((install) => ({
          skillId: install.skillId,
          registryPath: install.registryPath,
          configuration: resolveSkillConfiguration(agent, install),
          installId: install.id,
        })),
        telegramBotToken,
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
        onSkillInstalled: async ({ skillId, configuration }) => {
          await updateSkillInstall(id, skillId, {
            status: "installed",
            configJson: JSON.stringify(configuration),
            activatedAt: new Date(),
            lastError: null,
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

function primarySkillId(
  agent: Awaited<ReturnType<typeof getDeployedAgent>>,
): string | null {
  return primarySkillInstall(agent?.skills ?? [])?.skillId ?? null;
}

function buildSkillStatusPayload(
  agent: NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>,
  skillStats?: Record<string, SkillStatsSummary>,
) {
  return agent.skills.map((install) => ({
    skillId: install.skillId,
    registryPath: install.registryPath,
    status: install.status,
    lastError: install.lastError,
    configuration: resolveSkillConfiguration(agent, install),
    stats: skillStats?.[install.skillId] ?? null,
  }));
}

function resolveActivitySkillId(
  agent: NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>,
  body: { skillId?: string; type?: string; matchId?: string },
): string | null {
  const explicit = body.skillId?.trim();
  if (explicit) {
    if (agent.skills.some((s) => s.skillId === explicit)) return explicit;
    return explicit;
  }
  if (body.type === "match" && body.matchId) {
    if (isGamearenaMatchId(body.matchId)) {
      return findEnabledGamearenaSkillInstall(agent.skills)?.skillId ?? null;
    }
    if (isActionOrderMatchId(body.matchId)) {
      return (
        agent.skills.find((s) => isActionOrderSkillId(s.skillId))?.skillId ?? null
      );
    }
  }
  if (
    body.type === "live_match" ||
    body.type === "live_clear" ||
    body.type === "arena_match" ||
    body.type === "refill"
  ) {
    return findEnabledGamearenaSkillInstall(agent.skills)?.skillId ?? null;
  }
  if (body.type === "match" || body.type === "log") {
    return findEnabledGamearenaSkillInstall(agent.skills)?.skillId ?? primarySkillId(agent);
  }
  return primarySkillId(agent);
}

function deployAgentRecord(
  agent: NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>,
  displayName: string,
): DeployAgentRecord {
  return {
    id: agent.id,
    displayName,
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

function gamePassTxErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/insufficient funds/i.test(message)) {
    return "Agent wallet needs CELO for GameArena username gas (~0.03 CELO)";
  }
  return message;
}

app.get("/deploy/:id/ladder", async (c) => {
  const agent = await getDeployedAgent(c.req.param("id"));
  if (!agent?.agentAddress) return c.json({ ladder: null });

  try {
    loadRuntimeEnv();
    const config = getRuntimeConfig();
    const skillConfig = parseDeployConfiguration(agent);
    const gamearenaAgents = await listGamearenaDeployedAgents();
    const agentRegistry = await buildGamearenaRegistryFromAgents({
      agentsRoot: config.agentsRoot,
      agents: gamearenaAgents
        .filter((row) => row.agentAddress)
        .map((row) => ({
          id: row.id,
          displayName: row.displayName,
          agentAddress: row.agentAddress!,
          skillId:
            findEnabledGamearenaSkillInstall(row.skills)?.skillId ??
            row.skills[0]?.skillId ??
            null,
          verified: false,
        })),
    });
    const key = agent.agentAddress.toLowerCase();
    agentRegistry[key] = {
      ...(agentRegistry[key] ?? {
        deployId: agent.id,
        displayName: agent.displayName,
        agentAddress: agent.agentAddress,
        skillId:
          findEnabledGamearenaSkillInstall(agent.skills)?.skillId ??
          GAMEARENA_SKILL_ID,
        gamePassUsername: null,
        verified: false,
        source: "goodagent",
      }),
    };

    const raw = await fetchGamearenaLadder(
      agent.agentAddress as `0x${string}`,
      skillConfig.CHALLENGE_AI_URL ?? undefined,
    );
    const ladder = raw
      ? enrichGamearenaLadder(raw, agentRegistry, agent.agentAddress as `0x${string}`)
      : null;
    return c.json({ ladder });
  } catch (err) {
    console.warn(`[host] ladder for ${c.req.param("id")}:`, err);
    return c.json({ ladder: null });
  }
});

async function fetchVerifyStatus(
  agentAddress: string,
): Promise<VerifyStatus | null> {
  const cached = verifyCache.get(agentAddress);
  if (cached && Date.now() - cached.at < VERIFY_CACHE_MS) {
    return cached.data;
  }
  try {
    const res = await fetch(`${VERIFY_API_BASE}/agent/verify/${agentAddress}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data: VerifyStatus = (await res.json()) as VerifyStatus;
    verifyCache.set(agentAddress, { at: Date.now(), data });
    return data;
  } catch {
    return cached?.data ?? null;
  }
}

registerGamearenaPartnerRoutes(app, {
  publicHostBase: HOST_PUBLIC_BASE,
  apiBase: API_BASE,
  fetchVerifyStatus,
});

registerActionOrderPartnerRoutes(app, {
  publicHostBase: HOST_PUBLIC_BASE,
  fetchVerifyStatus,
});

const GAMEARENA_SSE_UPSTREAM =
  process.env.GAMEARENA_LIVE_SSE_URL?.trim() ||
  "https://game-backend-production-6130.up.railway.app";
const GAMEARENA_SSE_ORIGIN = "https://gamearenahq.xyz";

/** Proxy GameArena live SSE — upstream allowlists gamearenahq.xyz Origin only. */
app.get("/arena/live/:matchId", async (c) => {
  const matchId = c.req.param("matchId").trim();
  if (!/^am_[a-f0-9]+$/i.test(matchId)) {
    return c.json({ error: "INVALID_MATCH_ID" }, 400);
  }

  const upstream = `${GAMEARENA_SSE_UPSTREAM.replace(/\/$/, "")}/api/arena/live/${encodeURIComponent(matchId)}`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      headers: {
        Accept: "text/event-stream",
        Origin: GAMEARENA_SSE_ORIGIN,
        Referer: `${GAMEARENA_SSE_ORIGIN}/games/challenge-ai`,
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: "UPSTREAM_UNREACHABLE", message }, 502);
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    const body = await upstreamRes.text().catch(() => "");
    let payload: unknown = { error: "UPSTREAM_ERROR" };
    try {
      payload = JSON.parse(body);
    } catch {
      if (body) payload = { error: body.slice(0, 200) };
    }
    return c.json(payload, upstreamRes.status as 400 | 403 | 404 | 502);
  }

  return new Response(upstreamRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "goodagent-host",
    pm2: process.env.PM2_HOME ? "configured" : "local",
  }),
);

/** GameArena challenge-ai ladder with GoodAgent wallet metadata for filtering. */
app.get("/leaderboard/gamearena", async (c) => {
  const agentsOnly = c.req.query("agentsOnly") === "1";
  try {
    loadRuntimeEnv();
    const config = getRuntimeConfig();
    const skillConfig = parseDeployConfiguration({
      configuration: c.req.query("challengeAiUrl")
        ? JSON.stringify({ CHALLENGE_AI_URL: c.req.query("challengeAiUrl") })
        : null,
    });
    const agents = await listGamearenaDeployedAgents();
    const withWallet = agents.filter((row) => row.agentAddress);
    if (!withWallet.length) {
      return c.json({ ladder: null, goodAgentCount: 0 });
    }

    const registry = await buildGamearenaRegistryFromAgents({
      agentsRoot: config.agentsRoot,
      agents: withWallet.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        agentAddress: row.agentAddress!,
        skillId: row.skills[0]?.skillId ?? null,
      })),
    });

    const sampleWallet = withWallet[0]!.agentAddress as `0x${string}`;
    const raw = await fetchGamearenaLadder(
      sampleWallet,
      skillConfig.CHALLENGE_AI_URL ?? undefined,
    );
    if (!raw) {
      return c.json({ error: "LADDER_UNAVAILABLE" }, 502);
    }

    const enriched = enrichGamearenaLadder(raw, registry, sampleWallet);
    return c.json({
      ladder: agentsOnly
        ? {
            ...enriched,
            enrichedTop: enriched.goodAgentTop,
            top: enriched.goodAgentTop.map(({ rank, wallet, points, matches, wins, username }) => ({
              rank,
              wallet,
              points,
              matches,
              wins,
              username,
            })),
          }
        : enriched,
      goodAgentCount: Object.keys(registry).length,
    });
  } catch (err) {
    console.warn("[host] gamearena leaderboard:", err);
    return c.json({ error: "LADDER_FAILED" }, 500);
  }
});

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
    skillConfigurations?: Record<string, Record<string, string>>;
    configuration?: Record<string, string>;
    telegramBotToken?: string;
    skipPayment?: boolean;
  }>();

  if (!body.displayName?.trim()) {
    return c.json({ error: "displayName is required" }, 400);
  }

  // Bot tokens are secrets: encrypted at rest, never stored in configuration.
  const telegramBotToken = body.telegramBotToken?.trim() || null;
  const configuration = { ...(body.configuration ?? {}) };
  delete configuration.TELEGRAM_BOT_TOKEN;

  let encryptionSecret: string | null = null;
  if (telegramBotToken) {
    loadRuntimeEnv();
    encryptionSecret = process.env.ENCRYPTION_SECRET?.trim() || null;
    if (!encryptionSecret) {
      return c.json(
        {
          error: "HOST_CONFIG",
          message: "ENCRYPTION_SECRET is not configured on this host",
        },
        500,
      );
    }
  }

  let skills;
  try {
    const requestedSkillIds =
      body.skillIds?.length
        ? body.skillIds
        : body.skillId
          ? [body.skillId]
          : ["gaming/wagering/gamearena_1v1"];

    try {
      assertDeploySkillCount(requestedSkillIds);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }

    const registry = await fetchSkillsRegistry();
    skills = requestedSkillIds.map((skillId) => {
      const entry = findRegistrySkill(registry, skillId);
      if (!entry) {
        throw new Error(`skill_id not in registry: ${skillId}`);
      }
      if (!isSkillDeployable(entry)) {
        throw new Error(`skill_id not available for deploy: ${skillId}`);
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
    configuration: Object.keys(configuration).length ? configuration : null,
    skillConfigurations: body.skillConfigurations ?? null,
    telegramBotToken,
    encryptionSecret,
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

/** Fast live arena snapshot — reads agent log file directly (no heavy stats RPC). */
app.get("/deploy/:id/live-snapshot", async (c) => {
  const agent = await getDeployedAgent(c.req.param("id"));
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const gamearenaSkill = findEnabledGamearenaSkillInstall(agent.skills);
  const skillId = gamearenaSkill?.skillId ?? primarySkillId(agent);
  if (!skillId?.includes("gamearena")) {
    return c.json({
      liveMatch: null,
      activeArenaMatchId: null,
      logTail: null,
      pm2: agent.pm2Name ? pm2ProcessSnapshot(agent.pm2Name) : null,
    });
  }

  loadRuntimeEnv();
  const config = getRuntimeConfig();
  const pm2 = agent.pm2Name ? pm2ProcessSnapshot(agent.pm2Name) : null;
  const logTail = readAgentLogTail(config.agentsRoot, agent.id, 48);
  let liveMatch: GameArenaLiveMatch | null = null;
  let activeArenaMatchId: string | null = null;
  try {
    [liveMatch, activeArenaMatchId] = await Promise.all([
      getDeployLiveMatch(agent.id),
      getActiveArenaMatchId(agent.id),
    ]);
  } catch {
    // DB flake — infer live state from agent log file only
  }
  const resolved = resolveLiveArenaFromLog(
    logTail,
    agent.displayName,
    liveMatch,
    activeArenaMatchId,
  );

  void maybePauseGamearenaAtDailyCap(agent, logTail);

  return c.json({
    liveMatch: resolved.liveMatch,
    activeArenaMatchId: resolved.activeArenaMatchId,
    logTail,
    pm2,
  });
});

app.get("/deploy/:id/status", async (c) => {
  const agent = await getDeployedAgent(c.req.param("id"));
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const pm2 = agent.pm2Name ? pm2ProcessSnapshot(agent.pm2Name) : null;
  const lite = c.req.query("lite") === "1";
  const includeLadder = c.req.query("ladder") === "1";

  const verifyPromise = agent.agentAddress
    ? fetchVerifyStatus(agent.agentAddress)
    : Promise.resolve(null);

  if (lite) {
    const primary = primarySkillInstall(agent.skills);
    const skillId = primary?.skillId ?? null;
    const primaryConfig = primary
      ? resolveSkillConfiguration(agent, primary)
      : parseDeployConfiguration(agent);
    let logTail: string | null = null;
    if (findEnabledGamearenaSkillInstall(agent.skills)) {
      loadRuntimeEnv();
      const config = getRuntimeConfig();
      logTail = readAgentLogTail(config.agentsRoot, agent.id, 48);
    }
    const [verify, liveMatch, activeArenaMatchId] = await Promise.all([
      verifyPromise,
      getDeployLiveMatch(agent.id),
      getActiveArenaMatchId(agent.id),
    ]);
    const resolved = resolveLiveArenaFromLog(
      logTail,
      agent.displayName,
      liveMatch,
      activeArenaMatchId,
    );
    void maybePauseGamearenaAtDailyCap(agent, logTail);
    return c.json({
      id: agent.id,
      displayName: agent.displayName,
      template: agent.template,
      skillId,
      skills: buildSkillStatusPayload(agent),
      configuration: JSON.stringify(primaryConfig),
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
      stats: logTail ? { logTail } : null,
      liveMatch: resolved.liveMatch,
      activeArenaMatchId: resolved.activeArenaMatchId,
    });
  }

  const statsPromise = (async () => {
    if (!agent.agentAddress) return null;
    try {
      loadRuntimeEnv();
      const config = getRuntimeConfig();
      const skillConfig = (() => {
        const gamearena = findEnabledGamearenaSkillInstall(agent.skills);
        if (gamearena) return resolveSkillConfiguration(agent, gamearena);
        const primary = primarySkillInstall(agent.skills);
        return primary
          ? resolveSkillConfiguration(agent, primary)
          : parseDeployConfiguration(agent);
      })();

      let agentRegistry: Awaited<
        ReturnType<typeof buildGamearenaRegistryFromAgents>
      > | undefined;

      if (includeLadder) {
        const gamearenaAgents = await listGamearenaDeployedAgents();
        agentRegistry = await buildGamearenaRegistryFromAgents({
          agentsRoot: config.agentsRoot,
          agents: gamearenaAgents
            .filter((row) => row.agentAddress)
            .map((row) => ({
              id: row.id,
              displayName: row.displayName,
              agentAddress: row.agentAddress!,
              skillId:
                findEnabledGamearenaSkillInstall(row.skills)?.skillId ??
                row.skills[0]?.skillId ??
                null,
              verified: false,
            })),
        });
        if (agent.agentAddress) {
          const key = agent.agentAddress.toLowerCase();
          agentRegistry[key] = {
            ...(agentRegistry[key] ?? {
              deployId: agent.id,
              displayName: agent.displayName,
              agentAddress: agent.agentAddress,
              skillId:
                findEnabledGamearenaSkillInstall(agent.skills)?.skillId ??
                "gaming/wagering/gamearena_1v1",
              gamePassUsername: null,
              verified: false,
              source: "goodagent",
            }),
          };
        }
      }

      const gamearenaSkill = findEnabledGamearenaSkillInstall(agent.skills);
      const skillId = gamearenaSkill?.skillId ?? primarySkillId(agent);
      let persistedMatches: Awaited<ReturnType<typeof listDeployMatches>> = [];
      let persistedLogTail: string | null = null;

      if (gamearenaSkill) {
        const deployDir = agentDir(config.agentsRoot, agent.id);
        const statePath = resolve(
          deployDir,
          "skills",
          skillFolderFromRegistryPath(gamearenaSkill.registryPath),
          "state.json",
        );
        const outLog = resolve(deployDir, "logs", "out.log");
        scheduleDeployFileSync(
          agent.id,
          existsSync(statePath) ? statePath : null,
          existsSync(outLog) ? outLog : null,
          agent.skills.map((s) => s.skillId),
          gamearenaSkill.skillId,
        );
        [persistedMatches, persistedLogTail] = await Promise.all([
          listDeployMatchesForSkill(agent.id, gamearenaSkill.skillId, {
            includeLegacy: true,
          }),
          getDeployLogTail(agent.id, 12),
        ]);
      }

      return await getDeployStats({
        agentsRoot: config.agentsRoot,
        deployId: agent.id,
        agentAddress: agent.agentAddress as `0x${string}`,
        skillId,
        rpcUrl: config.rpcUrl,
        configBaselineGs: skillConfig.BASELINE_GS ?? null,
        playMode:
          skillConfig.PLAY_MODE === "onchain"
            ? "onchain"
            : skillConfig.PLAY_MODE === "auto"
              ? "auto"
              : skillConfig.PLAY_MODE === "offchain"
                ? "offchain"
                : null,
        challengeAiUrl: skillConfig.CHALLENGE_AI_URL ?? null,
        displayName: agent.displayName,
        agentRegistry,
        includeLadder,
        persistedMatches,
        persistedLogTail,
      });
    } catch (err) {
      console.warn(`[host] stats for ${agent.id}:`, err);
      return null;
    }
  })();

  const liveMatchPromise = getDeployLiveMatch(agent.id);
  const activeArenaMatchIdPromise = getActiveArenaMatchId(agent.id);

  const skillStatsPromise = (async (): Promise<
    Record<string, SkillStatsSummary>
  > => {
    if (!agent.agentAddress) return {};
    try {
      loadRuntimeEnv();
      const config = getRuntimeConfig();
      const registry = await fetchSkillsRegistry();
      const registryEntries: Record<
        string,
        Pick<RegistrySkillWithDashboard, "skill_id" | "dashboard">
      > = {};
      for (const install of agent.skills) {
        const entry = findRegistrySkill(registry, install.skillId);
        if (entry) registryEntries[install.skillId] = entry;
      }
      return await collectDeploySkillStats({
        agentsRoot: config.agentsRoot,
        deployId: agent.id,
        agentAddress: agent.agentAddress as `0x${string}`,
        rpcUrl: config.rpcUrl,
        skills: agent.skills.map((install) => ({
          skillId: install.skillId,
          registryPath: install.registryPath,
          status: install.status,
          configuration: resolveSkillConfiguration(agent, install),
        })),
        registryEntries,
      });
    } catch (err) {
      console.warn(`[host] skill stats for ${agent.id}:`, err);
      return {};
    }
  })();

  const [verify, stats, skillStats, liveMatch, activeArenaMatchId] =
    await Promise.all([
      verifyPromise,
      statsPromise,
      skillStatsPromise,
      liveMatchPromise,
      activeArenaMatchIdPromise,
    ]);

  if (stats?.ladder && agent.agentAddress && verify?.valid) {
    const key = agent.agentAddress.toLowerCase();
    if (stats.ladder.agentRegistry[key]) {
      stats.ladder.agentRegistry[key].verified = true;
    }
    if (stats.ladder.self?.goodAgent) {
      stats.ladder.self.goodAgent.verified = true;
    }
  }

  const logTail = stats?.logTail ?? null;
  const resolved = resolveLiveArenaFromLog(
    logTail,
    agent.displayName,
    liveMatch,
    activeArenaMatchId,
  );

  const primary = primarySkillInstall(agent.skills);
  const primaryConfig = primary
    ? resolveSkillConfiguration(agent, primary)
    : parseDeployConfiguration(agent);

  return c.json({
    id: agent.id,
    displayName: agent.displayName,
    template: agent.template,
    skillId: primary?.skillId ?? null,
    skills: buildSkillStatusPayload(agent, skillStats),
    configuration: JSON.stringify(primaryConfig),
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
    liveMatch: resolved.liveMatch,
    activeArenaMatchId: resolved.activeArenaMatchId,
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

  if (!agent.skills.length) {
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
    skillId?: string;
    matchId?: string;
    gameType?: number;
    wagerGs?: number;
    result?: "won" | "lost" | "unresolved";
    mode?: "offchain" | "onchain";
    at?: string;
    priceGs?: number;
    txHash?: string;
    message?: string;
    phase?: "starting" | "playing" | "ended";
    winsNeeded?: number;
    playerLabel?: string;
    round?: number;
    playerMove?: number;
    aiMove?: number;
    playerMoveLabel?: string;
    readLevel?: number;
    suddenDeath?: boolean;
    markovLine?: string;
    score?: { player: number; ai: number; ties: number };
    final?: GameArenaLiveMatch["final"];
    updatedAt?: string;
    roundResult?: "win" | "loss" | "tie";
    action?: "start" | "end";
  }>();

  const activitySkillId = resolveActivitySkillId(agent, body);

  if (body.type === "match") {
    if (!body.matchId || !body.result || body.gameType == null) {
      return c.json({ error: "INVALID_MATCH" }, 400);
    }
    await recordDeployMatch(
      id,
      {
        matchId: body.matchId,
        gameType: body.gameType,
        wagerGs: Number(body.wagerGs ?? 0),
        result: body.result,
        mode: body.mode ?? "offchain",
        at: body.at ?? new Date().toISOString(),
      },
      activitySkillId,
    );
    return c.json({ ok: true });
  }

  if (body.type === "refill") {
    if (!body.txHash || body.priceGs == null) {
      return c.json({ error: "INVALID_REFILL" }, 400);
    }
    await recordDeployRefill(
      id,
      {
        priceGs: Number(body.priceGs),
        txHash: body.txHash,
        at: body.at ?? new Date().toISOString(),
      },
      activitySkillId,
    );
    return c.json({ ok: true });
  }

  if (body.type === "log") {
    if (!body.message?.trim()) return c.json({ error: "INVALID_LOG" }, 400);
    await appendDeployLogLine(id, body.message, body.at, activitySkillId);
    return c.json({ ok: true });
  }

  if (body.type === "live_match") {
    if (!body.matchId || !body.phase) {
      return c.json({ error: "INVALID_LIVE_MATCH" }, 400);
    }
    const snapshot: GameArenaLiveMatch = {
      matchId: body.matchId,
      phase: body.phase,
      updatedAt: body.updatedAt ?? body.at ?? new Date().toISOString(),
      winsNeeded: body.winsNeeded,
      playerLabel: body.playerLabel,
      round: body.round,
      playerMove: body.playerMove,
      aiMove: body.aiMove,
      playerMoveLabel: body.playerMoveLabel,
      result: body.roundResult,
      readLevel: body.readLevel,
      suddenDeath: body.suddenDeath,
      markovLine: body.markovLine,
      score: body.score,
      final: body.final,
    };
    await setDeployLiveMatch(id, snapshot);
    return c.json({ ok: true });
  }

  if (body.type === "live_clear") {
    await setDeployLiveMatch(id, null);
    return c.json({ ok: true });
  }

  if (body.type === "arena_match") {
    if (!body.matchId || !body.action) {
      return c.json({ error: "INVALID_ARENA_MATCH" }, 400);
    }
    if (body.action === "start") {
      await setActiveArenaMatchId(id, body.matchId);
      await setDeployLiveMatch(id, {
        matchId: body.matchId,
        phase: "starting",
        updatedAt: new Date().toISOString(),
      });
    } else {
      await setActiveArenaMatchId(id, null);
    }
    return c.json({ ok: true });
  }

  return c.json({ error: "UNKNOWN_TYPE" }, 400);
});

/* ------------------------------------------------------------------ */
/* Telegram reminder skill — central subscriber store scoped by deploy */
/* ------------------------------------------------------------------ */

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

app.get("/deploy/:id/telegram/subscribers", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
  const id = c.req.param("id");
  const chatId = c.req.query("chatId");
  const subscribers = chatId
    ? await listChatSubscriptions(chatId, id)
    : await listActiveSubscribers(id);
  return c.json({
    subscribers: subscribers.map((s) => ({
      id: s.id,
      chatId: s.chatId,
      wallet: s.wallet,
      lastRemindedDay: s.lastRemindedDay,
      lastClaimedDay: s.lastClaimedDay,
      streak: s.streak,
      bestStreak: s.bestStreak,
    })),
  });
});

app.post("/deploy/:id/telegram/subscribe", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json<{ chatId?: string; wallet?: string }>();
  if (!body.chatId?.trim() || !body.wallet || !WALLET_RE.test(body.wallet)) {
    return c.json({ error: "chatId and a valid wallet are required" }, 400);
  }
  const sub = await subscribeWallet(body.chatId.trim(), body.wallet, id);
  return c.json({ ok: true, id: sub.id, streak: sub.streak });
});

app.post("/deploy/:id/telegram/unsubscribe", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json<{ chatId?: string; wallet?: string }>();
  if (!body.chatId?.trim()) {
    return c.json({ error: "chatId is required" }, 400);
  }
  if (body.wallet) {
    const removed = await unsubscribeWallet(body.chatId.trim(), body.wallet, id);
    return c.json({ ok: true, removed: removed ? 1 : 0 });
  }
  const removed = await unsubscribeChat(body.chatId.trim(), id);
  return c.json({ ok: true, removed });
});

app.post("/deploy/:id/telegram/reminded", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
  const body = await c.req.json<{ ids?: string[]; day?: string }>();
  if (!Array.isArray(body.ids) || !body.day) {
    return c.json({ error: "ids and day are required" }, 400);
  }
  await markReminded(body.ids, body.day);
  return c.json({ ok: true });
});

app.post("/deploy/:id/telegram/claims", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json<{ wallets?: string[]; day?: string }>();
  if (!Array.isArray(body.wallets) || !body.day) {
    return c.json({ error: "wallets and day are required" }, 400);
  }
  await recordClaims(body.wallets, body.day, id);
  return c.json({ ok: true });
});

app.get("/deploy/:id/telegram/leaderboard", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
  const id = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 10) || 10, 25);
  const rows = await streakLeaderboard(id, limit);
  return c.json({ leaderboard: rows });
});

app.post("/deploy/:id/telegram/deactivate", async (c) => {
  if (!internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json<{ chatIds?: string[] }>();
  if (!Array.isArray(body.chatIds)) {
    return c.json({ error: "chatIds is required" }, 400);
  }
  await deactivateChats(body.chatIds, id);
  return c.json({ ok: true });
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

  if (
    findGamearenaSkillInstall(agent.skills) &&
    agent.ownerWallet
  ) {
    const first = await getFirstGamearenaDeployForOwner(agent.ownerWallet);
    if (first && first.id !== id) {
      return c.json(gamearenaFirstAgentConflict(first), 409);
    }
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

async function applyDeploySkillConfiguration(
  id: string,
  agent: NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>,
  targetSkillId: string | undefined,
  sanitized: Record<string, string>,
) {
  loadRuntimeEnv();
  const runtimeConfig = getRuntimeConfig();
  const { merged, skillId, restarted } = applyDeployConfiguration(
    runtimeConfig,
    deployAgentRecord(agent, agent.displayName),
    sanitized,
    targetSkillId,
  );
  await patchSkillInstallConfiguration(id, skillId, merged);
  const primary = primarySkillInstall(agent.skills);
  if (primary?.skillId === skillId) {
    await updateDeployedAgent(id, {
      configuration: JSON.stringify(merged),
    });
  }
  const refreshed = await getDeployedAgent(id);
  if (!refreshed) throw new Error("NOT_FOUND");
  return {
    agent: publicAgent(refreshed),
    skillId,
    restarted,
    skills: buildSkillStatusPayload(refreshed),
  };
}

async function applyDeploySkillEnabled(
  id: string,
  agent: NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>,
  skillId: string,
  enabled: boolean,
) {
  const install = agent.skills.find((s) => s.skillId === skillId);
  if (!install) throw new Error(`skill not installed: ${skillId}`);

  loadRuntimeEnv();
  const runtimeConfig = getRuntimeConfig();
  const record = deployAgentRecord(agent, agent.displayName);
  const { restarted, status } = applySkillInstallStatus(
    runtimeConfig,
    record,
    skillId,
    enabled,
  );
  await updateSkillInstall(id, skillId, { status });
  const refreshed = await getDeployedAgent(id);
  if (!refreshed) throw new Error("NOT_FOUND");
  return {
    agent: publicAgent(refreshed),
    skillId,
    status,
    restarted,
    skills: buildSkillStatusPayload(refreshed),
  };
}

app.post("/deploy/:id/configuration", async (c) => {
  const id = c.req.param("id");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{
    skillId?: string;
    configuration?: Record<string, string>;
  } & Record<string, unknown>>();
  const authErr = await verifyDeployControl(
    "configuration",
    id,
    agent.ownerWallet,
    body,
  );
  if (authErr) return c.json({ error: authErr }, 401);

  const patch = body.configuration;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return c.json({ error: "configuration object required" }, 400);
  }

  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "string") sanitized[key] = value;
  }
  if (!Object.keys(sanitized).length) {
    return c.json({ error: "configuration must include at least one field" }, 400);
  }

  loadRuntimeEnv();
  try {
    const targetSkillId =
      body.skillId?.trim() || primarySkillId(agent) || undefined;
    const result = await applyDeploySkillConfiguration(
      id,
      agent,
      targetSkillId,
      sanitized,
    );
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ error: "CONFIG_APPLY_FAILED", message }, 500);
  }
});

app.post("/deploy/:id/skills/:skillId/configuration", async (c) => {
  const id = c.req.param("id");
  const skillId = c.req.param("skillId");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{
    configuration?: Record<string, string>;
  } & Record<string, unknown>>();
  const authErr = await verifyDeployControl(
    "configuration",
    id,
    agent.ownerWallet,
    body,
  );
  if (authErr) return c.json({ error: authErr }, 401);

  const patch = body.configuration;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return c.json({ error: "configuration object required" }, 400);
  }

  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "string") sanitized[key] = value;
  }
  if (!Object.keys(sanitized).length) {
    return c.json({ error: "configuration must include at least one field" }, 400);
  }

  try {
    const result = await applyDeploySkillConfiguration(
      id,
      agent,
      skillId,
      sanitized,
    );
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ error: "CONFIG_APPLY_FAILED", message }, 500);
  }
});

app.post("/deploy/:id/skills/:skillId/enable", async (c) => {
  const id = c.req.param("id");
  const skillId = c.req.param("skillId");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<Record<string, unknown>>();
  const authErr = await verifyDeployControl(
    "configuration",
    id,
    agent.ownerWallet,
    body,
  );
  if (authErr) return c.json({ error: authErr }, 401);

  try {
    const result = await applyDeploySkillEnabled(id, agent, skillId, true);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ error: "SKILL_ENABLE_FAILED", message }, 500);
  }
});

app.post("/deploy/:id/skills/:skillId/disable", async (c) => {
  const id = c.req.param("id");
  const skillId = c.req.param("skillId");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<Record<string, unknown>>();
  const authErr = await verifyDeployControl(
    "configuration",
    id,
    agent.ownerWallet,
    body,
  );
  if (authErr) return c.json({ error: authErr }, 401);

  try {
    const result = await applyDeploySkillEnabled(id, agent, skillId, false);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ error: "SKILL_DISABLE_FAILED", message }, 500);
  }
});

app.get("/deploy/:id/skills/:skillId", async (c) => {
  const id = c.req.param("id");
  const skillId = c.req.param("skillId");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const install = agent.skills.find((s) => s.skillId === skillId);
  if (!install) return c.json({ error: "SKILL_NOT_FOUND" }, 404);

  let stats: SkillStatsSummary | null = null;
  if (agent.agentAddress) {
    try {
      loadRuntimeEnv();
      const config = getRuntimeConfig();
      const registry = await fetchSkillsRegistry();
      const entry = findRegistrySkill(registry, install.skillId);
      stats = await collectSkillStats(
        {
          agentsRoot: config.agentsRoot,
          deployId: id,
          skillId: install.skillId,
          registryPath: install.registryPath,
          configuration: resolveSkillConfiguration(agent, install),
          agentAddress: agent.agentAddress as `0x${string}`,
          rpcUrl: config.rpcUrl,
        },
        entry,
      );
    } catch (err) {
      console.warn(`[host] skill detail stats for ${id}/${skillId}:`, err);
    }
  }

  return c.json({
    skillId: install.skillId,
    registryPath: install.registryPath,
    status: install.status,
    lastError: install.lastError,
    configuration: resolveSkillConfiguration(agent, install),
    stats,
  });
});

app.get("/deploy/:id/gamepass-username", async (c) => {
  const id = c.req.param("id");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const displayName = c.req.query("displayName")?.trim();
  if (!displayName) {
    return c.json({ error: "displayName query required" }, 400);
  }

  if (!findGamearenaSkillInstall(agent.skills)) {
    return c.json({ applicable: false });
  }
  if (!agent.agentAddress) {
    return c.json({ applicable: true, provisioned: false });
  }

  loadRuntimeEnv();
  let runtimeConfig;
  try {
    runtimeConfig = getRuntimeConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: "HOST_CONFIG", message }, 500);
  }

  try {
    const check = await checkGamePassUsernameForAgent({
      rpcUrl: runtimeConfig.rpcUrl,
      agentAddress: agent.agentAddress as `0x${string}`,
      displayName,
    });
    return c.json({ applicable: true, provisioned: true, ...check });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: "GAMEPASS_CHECK_FAILED", message }, 502);
  }
});

app.post("/deploy/:id/display-name", async (c) => {
  const id = c.req.param("id");
  const agent = await getDeployedAgent(id);
  if (!agent) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{
    displayName?: string;
  } & Record<string, unknown>>();
  const authErr = await verifyDeployControl(
    "display-name",
    id,
    agent.ownerWallet,
    body,
  );
  if (authErr) return c.json({ error: authErr }, 401);

  const displayName = body.displayName?.trim();
  if (!displayName) {
    return c.json({ error: "displayName is required" }, 400);
  }

  if (displayName === agent.displayName) {
    return c.json({ agent: publicAgent(agent) });
  }

  const gamearena = Boolean(findGamearenaSkillInstall(agent.skills));
  let gamePassUsername: string | undefined;
  let gamePassTxHash: string | undefined;
  let restarted = false;

  if (gamearena) {
    if (!agent.agentAddress || agent.walletDerivationIndex == null) {
      return c.json(
        {
          error: "AGENT_NOT_PROVISIONED",
          message: "Agent wallet not ready for GameArena username update",
        },
        400,
      );
    }

    loadRuntimeEnv();
    let runtimeConfig;
    try {
      runtimeConfig = getRuntimeConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "HOST_CONFIG", message }, 500);
    }

    const check = await checkGamePassUsernameForAgent({
      rpcUrl: runtimeConfig.rpcUrl,
      agentAddress: agent.agentAddress as `0x${string}`,
      displayName,
    });
    if (!check.available) {
      return c.json(
        {
          error: "USERNAME_TAKEN",
          message: `GameArena username "${check.candidate}" is not available`,
          candidate: check.candidate,
          currentOnChain: check.currentOnChain,
        },
        409,
      );
    }

    const account = deriveAgentAccount(
      runtimeConfig.deployMnemonic,
      agent.walletDerivationIndex,
    );

    try {
      const pass = await setGamePassUsername({
        rpcUrl: runtimeConfig.rpcUrl,
        account,
        targetUsername: check.candidate,
      });
      gamePassUsername = pass.username;
      gamePassTxHash = pass.txHash;
    } catch (err) {
      const message = gamePassTxErrorMessage(err);
      return c.json({ error: "GAMEPASS_TX_FAILED", message }, 502);
    }

    try {
      await updateDeployedAgent(id, { displayName });
      const refreshed = (await getDeployedAgent(id)) ?? agent;
      try {
        const sync = syncAgentAfterPassRename(
          runtimeConfig,
          deployAgentRecord(refreshed, displayName),
          gamePassUsername,
        );
        restarted = sync.restarted;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json(
          {
            error: "CONFIG_APPLY_FAILED",
            message,
            gamePassUsername,
            gamePassTxHash,
          },
          500,
        );
      }
      return c.json({
        agent: publicAgent(refreshed),
        gamePassUsername,
        gamePassTxHash,
        restarted,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json(
        {
          error: "DB_UPDATE_FAILED",
          message,
          gamePassUsername,
          gamePassTxHash,
        },
        500,
      );
    }
  }

  const updated = await updateDeployedAgent(id, { displayName });
  return c.json({ agent: publicAgent(updated) });
});

console.log(`[host] listening on :${HOST_PORT}`);

try {
  loadRuntimeEnv();
  const config = getRuntimeConfig();
  const patch = patchAllGamearenaDailyCapGuards(config);
  if (patch.patched > 0) {
    console.log(
      `[host] GameArena daily-cap guards: patched=${patch.patched} stoppedAtCap=${patch.stoppedAtCap}`,
    );
  }
} catch (err) {
  console.warn("[host] GameArena daily-cap guard patch failed:", err);
}

setInterval(() => {
  void sweepGamearenaDailyCaps();
}, 90_000);

serve({ fetch: app.fetch, port: HOST_PORT });
