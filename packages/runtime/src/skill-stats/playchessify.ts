import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dashboardPanelForSkillId,
  isPlaychessifyMatchId,
  isPlaychessifySkillId,
} from "@goodagent/shared";
import {
  getDeployLogTailForSkill,
  listDeployMatchesForSkill,
  type PersistedMatchRecord,
} from "@goodagent/db";
import { agentDir } from "../wallet.js";
import type { MatchRecord } from "../deploy-stats.js";
import type { SkillStatsAdapter } from "./types.js";

function readSkillOutLogTail(
  agentsRoot: string,
  deployId: string,
  lines = 24,
): string | null {
  const logPath = resolve(agentDir(agentsRoot, deployId), "logs", "out.log");
  if (!existsSync(logPath)) return null;
  try {
    const raw = readFileSync(logPath, "utf8").trim();
    if (!raw) return null;
    return raw.split("\n").slice(-lines).join("\n");
  } catch {
    return null;
  }
}

function activityFromLogTail(logTail: string | null | undefined): string | null {
  if (!logTail?.trim()) return null;
  const lines = logTail.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    if (line.includes("[skip]")) return line.replace(/^\[.*?\]\s*/, "");
    if (line.includes("[join]") || line.includes("[host]") || line.includes("[game")) {
      return line.replace(/^\[.*?\]\s*/, "");
    }
  }
  return null;
}

interface PlayChessifyStateFile {
  day?: string;
  matchesToday?: number;
  history?: Array<{
    matchId: string;
    gameId?: number;
    opponent?: string;
    result: "won" | "lost" | "draw";
    wagerChess?: number;
    at: string;
  }>;
}

function readPlayChessifyState(
  agentsRoot: string,
  deployId: string,
  registryPath: string,
): PlayChessifyStateFile | null {
  const folder = registryPath.split("/").pop() ?? registryPath;
  const statePath = resolve(
    agentDir(agentsRoot, deployId),
    "skills",
    folder,
    "state.json",
  );
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as PlayChessifyStateFile;
  } catch {
    return null;
  }
}

function stateToMatches(state: PlayChessifyStateFile): MatchRecord[] {
  return (state.history ?? [])
    .filter((m) => isPlaychessifyMatchId(m.matchId))
    .map((m) => ({
      matchId: m.matchId,
      gameType: 0,
      wagerGs: m.wagerChess ?? 0,
      result:
        m.result === "won"
          ? "won"
          : m.result === "lost"
            ? "lost"
            : "unresolved",
      mode: "onchain" as const,
      at: m.at,
    }));
}

function mergeMatches(
  persisted: PersistedMatchRecord[],
  fileHistory: MatchRecord[],
): MatchRecord[] {
  const byId = new Map<string, MatchRecord>();
  for (const rec of persisted) {
    if (isPlaychessifyMatchId(rec.matchId)) byId.set(rec.matchId, rec);
  }
  for (const rec of fileHistory) {
    byId.set(rec.matchId, rec);
  }
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}

export const playchessifySkillStatsAdapter: SkillStatsAdapter = {
  supports: (skillId) => isPlaychessifySkillId(skillId),
  async collect(ctx) {
    const [persisted, logTail, fileState] = await Promise.all([
      listDeployMatchesForSkill(ctx.deployId, ctx.skillId, { includeLegacy: false }),
      getDeployLogTailForSkill(ctx.deployId, ctx.skillId, 24),
      Promise.resolve(
        readPlayChessifyState(ctx.agentsRoot, ctx.deployId, ctx.registryPath),
      ),
    ]);

    const fileMatches = fileState ? stateToMatches(fileState) : [];
    const merged = mergeMatches(persisted, fileMatches);
    const fileLogTail = readSkillOutLogTail(ctx.agentsRoot, ctx.deployId, 24);
    const resolvedLogTail = logTail ?? fileLogTail;

    const wins = merged.filter((m) => m.result === "won").length;
    const losses = merged.filter((m) => m.result === "lost").length;
    const unresolved = merged.filter((m) => m.result === "unresolved").length;
    const day = new Date().toISOString().slice(0, 10);
    const dbToday = merged.filter((m) => m.at.startsWith(day)).length;
    const matchesToday =
      fileState?.day === day
        ? Math.max(fileState.matchesToday ?? 0, dbToday)
        : dbToday;

    const preset = ctx.configuration.STRATEGY_PRESET ?? "balanced";
    const maxWager = ctx.configuration.MAX_WAGER ?? "100";
    const activity = activityFromLogTail(resolvedLogTail);
    const intervalSec = ctx.configuration.MATCH_INTERVAL_SECONDS ?? "60";

    return {
      skillId: ctx.skillId,
      panel: dashboardPanelForSkillId(ctx.skillId),
      gamesPlayed: merged.length,
      wins,
      losses,
      unresolved,
      matchesToday,
      summary: merged.length
        ? `${wins}W / ${losses}L · ${preset} vs bots · max ${maxWager} CHESS`
        : activity ??
          (resolvedLogTail?.includes("[skip]")
            ? `Scanning for bot lobbies every ${intervalSec}s — none joinable right now`
            : "Running — waiting for first match"),
      matches: merged.slice().reverse(),
      logTail: resolvedLogTail,
      meta: {
        strategyPreset: preset,
        maxWagerChess: maxWager,
        minBotElo: ctx.configuration.TARGET_BOT_MIN_ELO ?? "600",
        maxBotElo: ctx.configuration.TARGET_BOT_MAX_ELO ?? "1200",
      },
    };
  },
};
