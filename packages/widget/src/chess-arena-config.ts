import type { SkillConfiguration } from "./types.js";

export const CHESS_ARENA_SKILL_ID = "gaming/wagering/chess_arena_1v1" as const;

export const CHESS_ARENA_DEFAULT_URL = "https://arena.chesspuzzles.xyz" as const;

export const CHESS_ARENA_PLAY_MODES = [
  {
    id: "auto",
    label: "Auto (recommended)",
    hint: "Join an open lobby if one exists; otherwise create a room and wait for an opponent.",
  },
  {
    id: "accept",
    label: "Accept only",
    hint: "Only join existing open lobbies — skip when none are available.",
  },
  {
    id: "open",
    label: "Open only",
    hint: "Always create a new lobby and wait for opponents.",
  },
] as const;

export const CHESS_ARENA_SOLVER_ENGINES = [
  {
    id: "stockfish",
    label: "Stockfish (recommended)",
    hint: "Full UCI engine — best for puzzle ratingSum scoring.",
  },
  {
    id: "basic",
    label: "Basic (mate-in-one only)",
    hint: "Fast but weak — only finds single-move checkmates.",
  },
] as const;

export type ChessArenaPlayMode = (typeof CHESS_ARENA_PLAY_MODES)[number]["id"];
export type ChessArenaSolverEngine = (typeof CHESS_ARENA_SOLVER_ENGINES)[number]["id"];

export function isChessArenaSkillId(skillId: string): boolean {
  return skillId === CHESS_ARENA_SKILL_ID;
}

export function parseChessArenaPlayMode(config: SkillConfiguration): ChessArenaPlayMode {
  const raw = (config.PLAY_MODE ?? "auto").trim().toLowerCase();
  if (raw === "open" || raw === "accept") return raw;
  return "auto";
}

export function parseChessArenaSolverEngine(
  config: SkillConfiguration,
): ChessArenaSolverEngine {
  const raw = (config.SOLVER_ENGINE ?? "stockfish").trim().toLowerCase();
  return raw === "basic" ? "basic" : "stockfish";
}

export function defaultChessArenaConfig(): SkillConfiguration {
  return {
    PLAY_MODE: "auto",
    SOLVER_ENGINE: "stockfish",
    SOLVER_MOVETIME_MS: "450",
    AUTO_SWAP: "1",
    USDT_STAKE_BUFFER: "1000000",
    MIN_GS_RESERVE: "50",
    MAX_MATCHES: "5",
    DAILY_MATCH_CAP: "20",
    MATCH_INTERVAL_SECONDS: "120",
  };
}
