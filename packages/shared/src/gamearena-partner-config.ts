import { GAMEARENA_SKILL_ID } from "./constants.js";

export type GamearenaPartnerFieldType =
  | "enum"
  | "string"
  | "number"
  | "boolean";

export interface GamearenaPartnerFieldWhen {
  [key: string]: string;
}

export interface GamearenaPartnerConfigField {
  key: string;
  type: GamearenaPartnerFieldType;
  label: string;
  hint?: string;
  default: string;
  options?: string[];
  when?: GamearenaPartnerFieldWhen;
  min?: number;
  max?: number;
}

export const GAMEARENA_PARTNER_CONFIG_FIELDS: GamearenaPartnerConfigField[] = [
  {
    key: "PLAY_MODE",
    type: "enum",
    label: "Play mode",
    default: "offchain",
    options: ["offchain", "onchain", "auto"],
  },
  {
    key: "MARKOV_STRATEGY",
    type: "enum",
    label: "Strategy vs MARKOV",
    default: "random",
    options: ["random", "sequence", "fixed", "counter"],
  },
  {
    key: "RPS_SEQUENCE",
    type: "string",
    label: "Sequence moves",
    hint: "Comma-separated: rock,paper,scissors",
    default: "rock,paper,scissors",
    when: { MARKOV_STRATEGY: "sequence" },
  },
  {
    key: "RPS_FIXED",
    type: "enum",
    label: "Fixed move",
    default: "rock",
    options: ["rock", "paper", "scissors"],
    when: { MARKOV_STRATEGY: "fixed" },
  },
  {
    key: "DAILY_MATCH_CAP",
    type: "number",
    label: "Daily match cap",
    default: "50",
    min: 0,
  },
  {
    key: "MAX_MATCHES",
    type: "number",
    label: "Max matches per session",
    default: "10",
    min: 0,
  },
  {
    key: "MATCH_INTERVAL_SECONDS",
    type: "number",
    label: "Seconds between matches",
    default: "300",
    min: 1,
  },
  {
    key: "ROUND_PACE_MS",
    type: "number",
    label: "Milliseconds between rounds",
    default: "1000",
    min: 0,
  },
  {
    key: "AUTO_REFILL",
    type: "boolean",
    label: "Auto-refill tickets",
    default: "1",
  },
  {
    key: "DAILY_REFILL_CAP_GS",
    type: "number",
    label: "Daily refill budget (G$)",
    default: "20",
    min: 0,
  },
  {
    key: "MAX_REFILLS_PER_DAY",
    type: "number",
    label: "Max refills per day",
    default: "10",
    min: 0,
  },
  {
    key: "WAGER_GS",
    type: "number",
    label: "On-chain wager (G$)",
    default: "1",
    min: 0,
  },
  {
    key: "DAILY_LOSS_CAP_GS",
    type: "number",
    label: "Daily loss cap (G$)",
    default: "20",
    min: 0,
  },
  {
    key: "ACCEPT_TIMEOUT_SECONDS",
    type: "number",
    label: "Accept timeout (seconds)",
    default: "90",
    min: 1,
  },
  {
    key: "GAME_TYPE",
    type: "enum",
    label: "Game type",
    default: "0",
    options: ["0"],
  },
];

const PARTNER_CONFIG_KEYS = new Set(
  GAMEARENA_PARTNER_CONFIG_FIELDS.map((field) => field.key),
);

/** Keys partners may read/write via the GameArena partner settings API. */
export function pickGamearenaPartnerConfiguration(
  config: Record<string, string>,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const field of GAMEARENA_PARTNER_CONFIG_FIELDS) {
    const value = config[field.key];
    if (typeof value === "string" && value.length) {
      picked[field.key] = value;
    } else {
      picked[field.key] = field.default;
    }
  }
  return picked;
}

/** Sanitize a partner settings patch — unknown keys are dropped. */
export function sanitizeGamearenaPartnerConfiguration(
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

export function gamearenaPartnerSettingsSchema() {
  return {
    skillId: GAMEARENA_SKILL_ID,
    fields: GAMEARENA_PARTNER_CONFIG_FIELDS,
  };
}
