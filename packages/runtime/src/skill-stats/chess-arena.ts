import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dashboardPanelForSkillId,
  isChessArenaMatchId,
  isChessArenaSkillId,
} from "@goodagent/shared";
import {
  getDeployLogTailForSkill,
  listDeployMatchesForSkill,
  type PersistedMatchRecord,
} from "@goodagent/db";
import { agentDir } from "../wallet.js";
import type { MatchRecord } from "../deploy-stats.js";
import type { SkillStatsAdapter } from "./types.js";

interface ChessArenaStateFile {
  day?: string;
  matchesToday?: number;
  history?: Array<{
    tournamentId: number;
    role: "open" | "accept";
    puzzlesSolved: number;
    ratingSum: number;
    result?: string;
    at: string;
  }>;
}

function readChessArenaState(
  agentsRoot: string,
  deployId: string,
  registryPath: string,
): ChessArenaStateFile | null {
  const folder = registryPath.split("/").pop() ?? "chess-arena-player";
  const statePath = resolve(
    agentDir(agentsRoot, deployId),
    "skills",
    folder,
    "state.json",
  );
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as ChessArenaStateFile;
  } catch {
    return null;
  }
}

function mapChessResult(
  raw: string | undefined,
  agentAddress: string | null,
): MatchRecord["result"] {
  if (!raw) return "unresolved";
  const lower = raw.toLowerCase();
  if (lower === "won" || lower === "win") return "won";
  if (lower === "lost" || lower === "loss") return "lost";
  if (agentAddress && /^0x[a-f0-9]{40}$/i.test(raw)) {
    return raw.toLowerCase() === agentAddress.toLowerCase() ? "won" : "lost";
  }
  return "unresolved";
}

function stateToMatches(
  state: ChessArenaStateFile,
  agentAddress: string | null,
): MatchRecord[] {
  return (state.history ?? []).map((h) => ({
    matchId: `arena-${h.tournamentId}`,
    gameType: 0,
    wagerGs: 0,
    result: mapChessResult(h.result, agentAddress),
    mode: "onchain" as const,
    at: h.at,
  }));
}

function mergeMatches(
  persisted: PersistedMatchRecord[],
  fileHistory: MatchRecord[],
): MatchRecord[] {
  const byId = new Map<string, MatchRecord>();
  for (const rec of persisted) {
    if (isChessArenaMatchId(rec.matchId)) byId.set(rec.matchId, rec);
  }
  for (const rec of fileHistory) {
    byId.set(rec.matchId, rec);
  }
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}

export const chessArenaSkillStatsAdapter: SkillStatsAdapter = {
  supports: (skillId) => isChessArenaSkillId(skillId),
  async collect(ctx) {
    const [persisted, logTail, fileState] = await Promise.all([
      listDeployMatchesForSkill(ctx.deployId, ctx.skillId, {
        includeLegacy: false,
      }),
      getDeployLogTailForSkill(ctx.deployId, ctx.skillId, 24),
      Promise.resolve(
        readChessArenaState(ctx.agentsRoot, ctx.deployId, ctx.registryPath),
      ),
    ]);

    const fileMatches = fileState
      ? stateToMatches(fileState, ctx.agentAddress)
      : [];
    const merged = mergeMatches(persisted, fileMatches);

    const wins = merged.filter((m) => m.result === "won").length;
    const losses = merged.filter((m) => m.result === "lost").length;
    const unresolved = merged.filter((m) => m.result === "unresolved").length;
    const day = new Date().toISOString().slice(0, 10);
    const dbToday = merged.filter((m) => m.at.startsWith(day)).length;
    const matchesToday =
      fileState?.day === day
        ? Math.max(fileState.matchesToday ?? 0, dbToday)
        : dbToday;

    const puzzlesSolved = (fileState?.history ?? []).reduce(
      (sum, h) => sum + (h.puzzlesSolved ?? 0),
      0,
    );
    const ratingSum = (fileState?.history ?? []).reduce(
      (sum, h) => sum + (h.ratingSum ?? 0),
      0,
    );

    const stakeUsdt =
      Number(ctx.configuration.USDT_STAKE_BUFFER ?? "1000000") / 1_000_000;

    return {
      skillId: ctx.skillId,
      panel: dashboardPanelForSkillId(ctx.skillId),
      gamesPlayed: merged.length,
      wins,
      losses,
      unresolved,
      matchesToday,
      summary: merged.length
        ? `${wins}W / ${losses}L · ${puzzlesSolved} puzzles · ${ratingSum} rating · ${stakeUsdt} USDT stake`
        : fileState?.matchesToday
          ? `${fileState.matchesToday} attempt(s) today · waiting for arena results`
          : null,
      matches: merged.slice().reverse(),
      logTail,
      meta: {
        playMode: ctx.configuration.PLAY_MODE ?? "auto",
        solver: ctx.configuration.SOLVER_ENGINE ?? "stockfish",
        stakeUsdt,
        puzzlesSolved,
        ratingSum,
      },
    };
  },
};
