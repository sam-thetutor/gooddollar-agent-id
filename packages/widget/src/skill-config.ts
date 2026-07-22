import type { SkillConfiguration } from "./types.js";

export const GAMEARENA_SKILL_ID = "gaming/wagering/gamearena_1v1" as const;
export const ACTIONORDER_SKILL_ID =
  "gaming/card-fighter/actionorder_vshouse" as const;
export const UBI_REMINDER_SKILL_ID = "social/reminder/ubi_claim_reminder" as const;
export const BALAIO_WORKER_SKILL_ID = "work/marketplace/balaio_worker" as const;

export type DeployTemplate = "gaming" | "social" | "work";

/** Defaults aligned with goodagentids.xyz deploy page. */
export function defaultConfigForSkill(skillId: string): SkillConfiguration {
  if (skillId === GAMEARENA_SKILL_ID) {
    return {
      PLAY_MODE: "offchain",
      MARKOV_STRATEGY: "random",
      RPS_SEQUENCE: "rock,paper,scissors",
      RPS_FIXED: "rock",
      DAILY_MATCH_CAP: "50",
      AUTO_REFILL: "1",
      DAILY_REFILL_CAP_GS: "20",
      MAX_REFILLS_PER_DAY: "10",
      WAGER_GS: "1",
      DAILY_LOSS_CAP_GS: "20",
      ACCEPT_TIMEOUT_SECONDS: "90",
      GAME_TYPE: "0",
      MAX_MATCHES: "10",
      MATCH_INTERVAL_SECONDS: "300",
    };
  }
  if (skillId === ACTIONORDER_SKILL_ID) {
    return {
      CHARACTER_ID: "riven",
      STRATEGY: "anti_strike",
      DIFFICULTY: "0",
      MAX_MATCHES: "5",
      DAILY_MATCH_CAP: "50",
      MATCH_INTERVAL_SECONDS: "10",
    };
  }
  if (skillId === UBI_REMINDER_SKILL_ID) {
    return {
      REMINDER_INTERVAL_MINUTES: "15",
      IDENTITY_EXPIRY_WARN_DAYS: "14",
    };
  }
  if (skillId === BALAIO_WORKER_SKILL_ID) {
    return {
      ENABLE_WORKER: "1",
      ENABLE_CREATE: "0",
      ENABLE_APPROVE: "0",
      SCAN_INTERVAL_SECONDS: "300",
      MIN_REWARD: "1",
      REWARD_TOKENS: "G$,USDC,CELO,cUSD",
      MAX_TASKS_PER_RUN: "1",
      CREATE_SLOTS: "1",
      CREATE_TOKEN: "G$",
      CREATE_VISIBILITY: "public",
      MAX_ESCROW_GS: "500",
      MIN_WALLET_RESERVE_GS: "10",
      CREATE_ONCE: "1",
    };
  }
  return {};
}

export function deployTemplateForSkill(skillId: string): DeployTemplate {
  if (skillId === UBI_REMINDER_SKILL_ID) return "social";
  if (skillId === BALAIO_WORKER_SKILL_ID) return "work";
  return "gaming";
}

export function defaultDisplayNameForSkill(skillId: string): string {
  if (skillId === GAMEARENA_SKILL_ID) return "My GameArena Agent";
  if (skillId === ACTIONORDER_SKILL_ID) return "My ACTION-ORDER Agent";
  if (skillId === UBI_REMINDER_SKILL_ID) return "My UBI Reminder Agent";
  if (skillId === BALAIO_WORKER_SKILL_ID) return "My Balaio Worker";
  const slug = skillId.split("/").pop() ?? "agent";
  return `My ${slug.replace(/_/g, " ")} Agent`;
}

export function skillShortLabel(skillId: string): string {
  return skillId.split("/").pop()?.replace(/_/g, " ") ?? skillId;
}

export function deployHintForSkill(skillId: string): string {
  if (skillId === UBI_REMINDER_SKILL_ID) {
    return "We install your reminder bot and keep it running after you vouch.";
  }
  if (skillId === BALAIO_WORKER_SKILL_ID) {
    return "We fund a play wallet, install the Balaio skill, and keep your agent running after you vouch.";
  }
  if (skillId === GAMEARENA_SKILL_ID) {
    return "Your wallet owns the agent. GoodAgent runs gameplay on a dedicated server wallet — no key export needed.";
  }
  return "Your wallet owns the agent. GoodAgent provisions and runs the skill on a dedicated server wallet.";
}

/** @deprecated use defaultConfigForSkill(GAMEARENA_SKILL_ID) */
export const DEFAULT_GAMEARENA_CONFIG = defaultConfigForSkill(GAMEARENA_SKILL_ID);
