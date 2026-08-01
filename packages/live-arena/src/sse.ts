import type { GameArenaLiveMatch } from "./live.js";
import { inferLiveMatchFromLogTail, rpsMoveName } from "./live.js";

export type GameArenaSseEvent =
  | { type: "hello"; matchId: string }
  | {
      type: "round";
      round: number;
      playerMove: number;
      aiMove: number;
      result: "win" | "loss" | "tie";
      score: { player: number; ai: number; ties: number };
      called?: boolean;
      readLevel?: number;
      suddenDeath?: boolean;
      markovLine?: string;
    }
  | {
      type: "end";
      round?: number;
      playerMove?: number;
      aiMove?: number;
      result?: "win" | "loss" | "tie";
      score?: { player: number; ai: number; ties: number };
      markovLine?: string;
      final: {
        outcome: "player_won" | "ai_won" | "tie";
        seed?: string;
        commitHash?: string;
        totalRounds?: number;
        calledCount?: number;
        matchLine?: string;
      };
    };

/** Resolve host base for SSE — explicit URL, Vite dev proxy, or production default. */
export function resolveHostBaseUrl(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim().replace(/\/$/, "");

  if (typeof import.meta !== "undefined") {
    const env = (import.meta as ImportMeta & {
      env?: Record<string, string | boolean | undefined>;
    }).env;
    if (env) {
      if (env.PROD) return "/host";
      const configured =
        typeof env.VITE_HOST_BASE_URL === "string"
          ? env.VITE_HOST_BASE_URL.trim()
          : "";
      if (configured && env.VITE_HOST_USE_LOCAL === "1") {
        return configured.replace(/\/$/, "");
      }
      return "/host";
    }
  }

  return "https://goodagentids.xyz/host";
}

export function gameArenaLiveSseUrl(
  matchId: string,
  hostBaseUrl?: string,
): string {
  const base = resolveHostBaseUrl(hostBaseUrl);
  return `${base}/arena/live/${encodeURIComponent(matchId)}`;
}

export function mapGameArenaSseEvent(
  event: GameArenaSseEvent,
  matchId: string,
  playerLabel?: string,
): GameArenaLiveMatch {
  const label = playerLabel?.trim() || "Agent";
  const updatedAt = new Date().toISOString();

  if (event.type === "hello") {
    return {
      matchId: event.matchId || matchId,
      phase: "starting",
      updatedAt,
      playerLabel: label,
      score: { player: 0, ai: 0, ties: 0 },
    };
  }

  if (event.type === "round") {
    return {
      matchId,
      phase: "playing",
      updatedAt,
      playerLabel: label,
      round: event.round,
      playerMove: event.playerMove,
      aiMove: event.aiMove,
      playerMoveLabel: rpsMoveName(event.playerMove),
      result: event.result,
      readLevel: event.readLevel,
      suddenDeath: event.suddenDeath,
      markovLine: event.markovLine,
      score: event.score,
      winsNeeded: 3,
    };
  }

  return {
    matchId,
    phase: "ended",
    updatedAt,
    playerLabel: label,
    round: event.round,
    playerMove: event.playerMove,
    aiMove: event.aiMove,
    playerMoveLabel:
      event.playerMove != null ? rpsMoveName(event.playerMove) : undefined,
    result: event.result,
    markovLine: event.markovLine ?? event.final.matchLine,
    score: event.score,
    winsNeeded: 3,
    final: {
      outcome: event.final.outcome,
      totalRounds: event.final.totalRounds,
      matchLine: event.final.matchLine,
    },
  };
}

export function parseGameArenaSsePayload(raw: string): GameArenaSseEvent | null {
  try {
    const data = JSON.parse(raw) as GameArenaSseEvent;
    if (!data?.type) return null;
    return data;
  } catch {
    return null;
  }
}

const START_LINE = /^\[start\] match (\S+)/;

/** Latest match id from skill log tail (fallback before host posts arena_match). */
export function extractArenaMatchIdFromLog(
  logTail: string | null | undefined,
): string | null {
  if (!logTail?.trim()) return null;
  const lines = logTail.trim().split("\n");
  const ended = new Set<string>();
  for (const line of lines) {
    const end = line.match(/^\[match (\S+)\] (?:WON|LOST)/);
    if (end) ended.add(end[1]!);
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i]!.match(START_LINE);
    if (m && !ended.has(m[1]!)) return m[1]!;
    const round = lines[i]!.match(/^\[match (\S+)\]/);
    if (round && !ended.has(round[1]!)) return round[1]!;
  }
  return null;
}

/** Only subscribe to GameArena SSE while a match is actively in progress. */
export function resolveActiveSseMatchId(opts: {
  debugMatchId?: string | null;
  activeArenaMatchId?: string | null;
  liveMatch?: GameArenaLiveMatch | null;
  logTail?: string | null;
  playerLabel?: string;
}): string | null {
  if (opts.debugMatchId?.trim()) return opts.debugMatchId.trim();
  if (opts.activeArenaMatchId?.trim()) return opts.activeArenaMatchId.trim();

  const host = opts.liveMatch;
  if (host && (host.phase === "starting" || host.phase === "playing")) {
    return host.matchId;
  }

  const inferred = inferLiveMatchFromLogTail(opts.logTail, opts.playerLabel);
  if (
    inferred &&
    (inferred.phase === "starting" || inferred.phase === "playing")
  ) {
    return inferred.matchId;
  }

  return null;
}
