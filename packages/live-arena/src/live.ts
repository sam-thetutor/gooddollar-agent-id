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

/** Fallback when the skill has not posted `live_match` activity yet (older deploys). */
export function inferLiveMatchFromLogTail(
  logTail: string | null | undefined,
  playerLabel?: string,
): GameArenaLiveMatch | null {
  if (!logTail?.trim()) return null;

  const lines = logTail.trim().split("\n");
  const name = playerLabel?.trim() || "Agent";
  let latest: LogLiveEvent | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const start = line.match(START_LINE);
    if (start) {
      latest = { kind: "start", lineIndex, matchId: start[1]! };
      continue;
    }
    const end = line.match(END_LINE);
    if (end) {
      latest = {
        kind: "end",
        lineIndex,
        matchId: end[1]!,
        outcome: end[2] === "WON" ? "player_won" : "ai_won",
        totalRounds: Number(end[3]),
        matchLine: end[4],
      };
      continue;
    }
    const round = line.match(ROUND_LINE);
    if (round) {
      latest = {
        kind: "round",
        lineIndex,
        matchId: round[1]!,
        round: Number(round[2]),
        playerMoveLabel: round[3]!.trim(),
        aiMove: Number(round[4]),
        result: round[5] as "win" | "loss" | "tie",
        markovLine: round[6],
      };
    }
  }

  if (!latest) return null;

  const event: LogLiveEvent = latest;
  const distFromEnd = lines.length - 1 - event.lineIndex;
  const stale =
    (event.kind === "round" && distFromEnd > 1) ||
    (event.kind === "start" && distFromEnd > 0) ||
    (event.kind === "end" && distFromEnd > 4);
  if (stale) return null;

  const updatedAt = new Date().toISOString();

  if (event.kind === "end") {
    let roundSnap: Extract<LogLiveEvent, { kind: "round" }> | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const round = lines[i]!.match(ROUND_LINE);
      if (round && round[1] === event.matchId) {
        roundSnap = {
          kind: "round",
          lineIndex: i,
          matchId: round[1]!,
          round: Number(round[2]),
          playerMoveLabel: round[3]!.trim(),
          aiMove: Number(round[4]),
          result: round[5] as "win" | "loss" | "tie",
          markovLine: round[6],
        };
        break;
      }
    }
    return {
      matchId: event.matchId,
      phase: "ended",
      updatedAt,
      playerLabel: name,
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

  if (event.kind === "round") {
    return {
      matchId: event.matchId,
      phase: "playing",
      updatedAt,
      playerLabel: name,
      round: event.round,
      playerMoveLabel: event.playerMoveLabel,
      aiMove: event.aiMove,
      result: event.result,
      markovLine: event.markovLine,
    };
  }

  return {
    matchId: event.matchId,
    phase: "starting",
    updatedAt,
    playerLabel: name,
  };
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

  const host = opts.hostLive;
  if (host && (host.phase === "starting" || host.phase === "playing")) {
    return host;
  }

  const betweenMatches =
    opts.agentLive && !opts.hasActiveSseTarget && host?.phase !== "playing";
  if (betweenMatches) return null;

  if (host?.phase === "ended") {
    const hostAt = new Date(host.updatedAt).getTime();
    if (!Number.isNaN(hostAt) && Date.now() - hostAt < 120_000) return host;
  }

  return opts.logFallback ?? host ?? null;
}

export const GAMEARENA_SKILL_ID = "gaming/wagering/gamearena_1v1";

export function isGamearenaSkill(skillId?: string | null): boolean {
  return skillId === GAMEARENA_SKILL_ID;
}

export function shouldFastPollLiveArena(status: {
  liveMatch?: GameArenaLiveMatch | null;
  activeArenaMatchId?: string | null;
} | null | undefined): boolean {
  if (!status) return false;
  if (status.activeArenaMatchId?.trim()) return true;
  const phase = status.liveMatch?.phase;
  return phase === "starting" || phase === "playing";
}
