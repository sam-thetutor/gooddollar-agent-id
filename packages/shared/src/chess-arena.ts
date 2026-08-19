export const CHESS_ARENA_SKILL_ID = "gaming/wagering/chess_arena_1v1" as const;

export const CHESS_ARENA_DEFAULT_URL = "https://arena.chesspuzzles.xyz" as const;

import { isChessArenaMatchId } from "./deploy-skills.js";

export { isChessArenaMatchId };

/** Parse tournament id from a chess arena match id (`arena-123` → 123). */
export function parseChessArenaTournamentId(matchId: string): number | null {
  const trimmed = matchId.trim();
  if (!isChessArenaMatchId(trimmed)) return null;
  const n = Number(trimmed.slice("arena-".length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function chessArenaLiveWatchUrl(
  arenaUrl: string,
  matchId: string,
): string | null {
  const tournamentId = parseChessArenaTournamentId(matchId);
  if (tournamentId == null) return null;
  const base = arenaUrl.replace(/\/$/, "");
  return `${base}/tournament/${tournamentId}`;
}
