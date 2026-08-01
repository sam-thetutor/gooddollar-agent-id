export type GameArenaLivePhase = "starting" | "playing" | "ended";

export interface GameArenaLiveMatch {
  matchId: string;
  phase: GameArenaLivePhase;
  updatedAt: string;
  winsNeeded?: number;
  playerLabel?: string;
  round?: number;
  playerMove?: number;
  aiMove?: number;
  playerMoveLabel?: string;
  result?: "win" | "loss" | "tie";
  readLevel?: number;
  suddenDeath?: boolean;
  markovLine?: string;
  score?: { player: number; ai: number; ties: number };
  final?: {
    outcome: "player_won" | "ai_won" | "tie";
    totalRounds?: number;
    matchLine?: string;
  };
}

const RPS = ["Rock", "Paper", "Scissors"] as const;

export function rpsMoveName(move: number | undefined): string {
  if (move == null || move < 0 || move > 2) return "—";
  return RPS[move] ?? String(move);
}

export function roundResultLabel(result: GameArenaLiveMatch["result"]): string {
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  if (result === "tie") return "Tie";
  return "—";
}

export function matchOutcomeHeadline(
  final: GameArenaLiveMatch["final"],
  playerLabel: string,
): string {
  if (!final) return "Match finished";
  if (final.outcome === "player_won") return `${playerLabel} wins`;
  if (final.outcome === "ai_won") return "MARKOV wins";
  return "Draw";
}

const ROUND_LINE =
  /^\[match (\S+)\] r(\d+): (.+?) vs move (\d+) → (win|loss|tie)(?: \(called\))?(?:\s*—\s*"(.+?)")?\s*$/;
const END_LINE =
  /^\[match (\S+)\] (WON|LOST) in (\d+) rounds(?:\s*—\s*"(.+?)")?\s*$/;
const START_LINE = /^\[start\] match (\S+)/;

type LogLiveEvent =
  | {
      kind: "start";
      lineIndex: number;
      matchId: string;
    }
  | {
      kind: "round";
      lineIndex: number;
      matchId: string;
      round: number;
      playerMoveLabel: string;
      aiMove: number;
      result: "win" | "loss" | "tie";
      markovLine?: string;
    }
  | {
      kind: "end";
      lineIndex: number;
      matchId: string;
      outcome: "player_won" | "ai_won";
      totalRounds: number;
      matchLine?: string;
    };

type MatchLogState = {
  matchId: string;
  startLineIndex: number;
  endLineIndex?: number;
  latestRound?: Extract<LogLiveEvent, { kind: "round" }>;
  end?: Extract<LogLiveEvent, { kind: "end" }>;
};

function buildMatchStates(lines: string[]): Map<string, MatchLogState> {
  const matches = new Map<string, MatchLogState>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const start = line.match(START_LINE);
    if (start) {
      const matchId = start[1]!;
      matches.set(matchId, { matchId, startLineIndex: lineIndex });
      continue;
    }
    const end = line.match(END_LINE);
    if (end) {
      const matchId = end[1]!;
      const state = matches.get(matchId) ?? { matchId, startLineIndex: lineIndex };
      state.endLineIndex = lineIndex;
      state.end = {
        kind: "end",
        lineIndex,
        matchId,
        outcome: end[2] === "WON" ? "player_won" : "ai_won",
        totalRounds: Number(end[3]),
        matchLine: end[4],
      };
      matches.set(matchId, state);
      continue;
    }
    const round = line.match(ROUND_LINE);
    if (round) {
      const matchId = round[1]!;
      const state = matches.get(matchId) ?? { matchId, startLineIndex: lineIndex };
      state.latestRound = {
        kind: "round",
        lineIndex,
        matchId,
        round: Number(round[2]),
        playerMoveLabel: round[3]!.trim(),
        aiMove: Number(round[4]),
        result: round[5] as "win" | "loss" | "tie",
        markovLine: round[6],
      };
      matches.set(matchId, state);
    }
  }

  return matches;
}

function matchStateToLive(
  state: MatchLogState,
  playerLabel: string,
  updatedAt: string,
): GameArenaLiveMatch | null {
  if (state.endLineIndex == null) {
    if (state.latestRound) {
      const event = state.latestRound;
      return {
        matchId: event.matchId,
        phase: "playing",
        updatedAt,
        playerLabel,
        round: event.round,
        playerMoveLabel: event.playerMoveLabel,
        aiMove: event.aiMove,
        result: event.result,
        markovLine: event.markovLine,
      };
    }
    return {
      matchId: state.matchId,
      phase: "starting",
      updatedAt,
      playerLabel,
    };
  }

  if (!state.end) return null;
  const event = state.end;
  const roundSnap = state.latestRound;
  return {
    matchId: event.matchId,
    phase: "ended",
    updatedAt,
    playerLabel,
    round: roundSnap?.round,
    playerMoveLabel: roundSnap?.playerMoveLabel,
    aiMove: roundSnap?.aiMove,
    result: roundSnap?.result,
    markovLine: roundSnap?.markovLine ?? event.matchLine,
    final: {
      outcome: event.outcome,
      totalRounds: event.totalRounds,
      matchLine: event.matchLine,
    },
  };
}

/** Fallback when the skill has not posted `live_match` activity yet (older deploys). */
export function inferLiveMatchFromLogTail(
  logTail: string | null | undefined,
  playerLabel?: string,
): GameArenaLiveMatch | null {
  if (!logTail?.trim()) return null;

  const lines = logTail.trim().split("\n");
  const name = playerLabel?.trim() || "Agent";
  const updatedAt = new Date().toISOString();
  const matches = buildMatchStates(lines);

  let openMatch: MatchLogState | null = null;
  for (const state of matches.values()) {
    if (state.endLineIndex == null) {
      if (!openMatch || state.startLineIndex > openMatch.startLineIndex) {
        openMatch = state;
      }
    }
  }

  if (openMatch) {
    return matchStateToLive(openMatch, name, updatedAt);
  }

  // Between matches — replay the most recent finished match still near log tail.
  let recentEnd: MatchLogState | null = null;
  for (const state of matches.values()) {
    if (state.endLineIndex == null) continue;
    const distFromEnd = lines.length - 1 - state.endLineIndex;
    if (distFromEnd > 12) continue;
    if (!recentEnd || state.endLineIndex > recentEnd.endLineIndex!) {
      recentEnd = state;
    }
  }

  if (recentEnd) {
    return matchStateToLive(recentEnd, name, updatedAt);
  }

  return null;
}

/** Prefer host snapshot; fill gaps from log lines when the agent only reports logs. */
export function resolveLiveMatchDisplay(opts: {
  liveMatch?: GameArenaLiveMatch | null;
  logTail?: string | null;
  playerLabel?: string;
}): GameArenaLiveMatch | null {
  const inferred = inferLiveMatchFromLogTail(opts.logTail, opts.playerLabel);
  const host = opts.liveMatch ?? null;

  if (!host) return inferred;
  if (!inferred) return host;

  if (host.phase === "playing" || host.phase === "starting") return host;
  if (inferred.phase === "playing" || inferred.phase === "starting") {
    return inferred;
  }

  const hostAt = new Date(host.updatedAt).getTime();
  const hostRecent =
    !Number.isNaN(hostAt) && Date.now() - hostAt < 120_000;
  if (hostRecent) return host;
  return inferred;
}

/** Pick the best live snapshot — SSE/host first; skip stale log replay between matches. */
export function pickArenaLiveDisplay(opts: {
  sseLive?: GameArenaLiveMatch | null;
  hostLive?: GameArenaLiveMatch | null;
  logFallback?: GameArenaLiveMatch | null;
  agentLive?: boolean;
  hasActiveSseTarget?: boolean;
}): GameArenaLiveMatch | null {
  if (opts.sseLive) return opts.sseLive;

  const log = opts.logFallback;
  if (log && (log.phase === "starting" || log.phase === "playing")) {
    return log;
  }

  const host = opts.hostLive;
  if (host && (host.phase === "starting" || host.phase === "playing")) {
    return host;
  }

  if (log?.phase === "ended" && opts.agentLive) {
    return log;
  }

  const logActive =
    log?.phase === "starting" || log?.phase === "playing";
  const betweenMatches =
    opts.agentLive &&
    !opts.hasActiveSseTarget &&
    !logActive &&
    host?.phase !== "playing" &&
    log?.phase !== "ended";
  if (betweenMatches) return null;

  if (host?.phase === "ended" && !logActive) {
    const hostAt = new Date(host.updatedAt).getTime();
    if (!Number.isNaN(hostAt) && Date.now() - hostAt < 30_000) return host;
  }

  return log ?? host ?? null;
}

export const GAMEARENA_SKILL_ID = "gaming/wagering/gamearena_1v1";

export function isGamearenaSkill(skillId?: string | null): boolean {
  return skillId === GAMEARENA_SKILL_ID;
}

export function shouldFastPollLiveArena(status: {
  liveMatch?: GameArenaLiveMatch | null;
  activeArenaMatchId?: string | null;
  stats?: { logTail?: string | null } | null;
} | null | undefined): boolean {
  if (!status) return false;
  if (status.activeArenaMatchId?.trim()) return true;
  const phase = status.liveMatch?.phase;
  if (phase === "starting" || phase === "playing") return true;
  const inferred = inferLiveMatchFromLogTail(status.stats?.logTail);
  return inferred?.phase === "starting" || inferred?.phase === "playing";
}
