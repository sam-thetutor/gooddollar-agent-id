import { CHESS_ARENA_SKILL_ID } from "./chess-arena.js";

export type ChessArenaPartnerFieldType =
  | "enum"
  | "string"
  | "number"
  | "boolean";

export interface ChessArenaPartnerFieldWhen {
  [key: string]: string;
}

export interface ChessArenaPartnerConfigField {
  key: string;
  type: ChessArenaPartnerFieldType;
  label: string;
  hint?: string;
  default: string;
  options?: string[];
  when?: ChessArenaPartnerFieldWhen;
  min?: number;
  max?: number;
}

export const CHESS_ARENA_PARTNER_CONFIG_FIELDS: ChessArenaPartnerConfigField[] = [
  {
    key: "PLAY_MODE",
    type: "enum",
    label: "Lobby mode",
    default: "auto",
    options: ["auto", "open", "accept"],
    hint: "auto: join open lobby or create one; accept: join only; open: always create.",
  },
  {
    key: "SOLVER_ENGINE",
    type: "enum",
    label: "Puzzle solver",
    default: "stockfish",
    options: ["stockfish", "basic"],
  },
  {
    key: "SOLVER_MOVETIME_MS",
    type: "number",
    label: "Stockfish think time (ms)",
    default: "450",
    min: 100,
    max: 3000,
    when: { SOLVER_ENGINE: "stockfish" },
  },
  {
    key: "AUTO_SWAP",
    type: "boolean",
    label: "Auto-swap G$ to USDT",
    default: "1",
  },
  {
    key: "DAILY_MATCH_CAP",
    type: "number",
    label: "Daily match cap",
    default: "20",
    min: 0,
  },
  {
    key: "MAX_MATCHES",
    type: "number",
    label: "Max matches per session",
    default: "5",
    min: 0,
  },
  {
    key: "MATCH_INTERVAL_SECONDS",
    type: "number",
    label: "Seconds between matches",
    default: "120",
    min: 10,
  },
  {
    key: "USDT_STAKE_BUFFER",
    type: "number",
    label: "USDT stake buffer (6 decimals)",
    default: "1000000",
    min: 0,
  },
  {
    key: "MIN_GS_RESERVE",
    type: "number",
    label: "Minimum G$ reserve (18 decimals)",
    default: "50000000000000000000",
    min: 0,
  },
];

const PARTNER_CONFIG_KEYS = new Set(
  CHESS_ARENA_PARTNER_CONFIG_FIELDS.map((field) => field.key),
);

export function pickChessArenaPartnerConfiguration(
  config: Record<string, string>,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const field of CHESS_ARENA_PARTNER_CONFIG_FIELDS) {
    const value = config[field.key];
    if (typeof value === "string" && value.length) {
      picked[field.key] = value;
    } else {
      picked[field.key] = field.default;
    }
  }
  return picked;
}

export function sanitizeChessArenaPartnerConfiguration(
  patch: Record<string, unknown>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!PARTNER_CONFIG_KEYS.has(key)) continue;
    if (typeof value === "string") sanitized[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = String(value);
    }
  }
  return sanitized;
}

export function chessArenaPartnerSettingsSchema() {
  return {
    skillId: CHESS_ARENA_SKILL_ID,
    fields: CHESS_ARENA_PARTNER_CONFIG_FIELDS,
  };
}
