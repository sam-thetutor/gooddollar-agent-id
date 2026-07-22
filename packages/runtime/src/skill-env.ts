import { chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";
import { GOODAGENT_API_URL } from "@goodagent/shared";
import { resolveGamearenaProxy } from "./gamearena-proxy.js";

export type SkillConfiguration = Record<string, string>;

export function writeSkillEnv(skillDir: string, vars: Record<string, string>): void {
  const lines = Object.entries(vars)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  const path = resolve(skillDir, ".env");
  writeFileSync(path, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows may not support chmod.
  }
}

export function buildHostReportEnv(deployId: string): Record<string, string> {
  const hostPort = process.env.HOST_PORT ?? "3002";
  const hostUrl =
    process.env.HOST_INTERNAL_URL?.trim() ??
    `http://127.0.0.1:${hostPort}`;
  const env: Record<string, string> = {
    DEPLOY_ID: deployId,
    GOODAGENT_HOST_URL: hostUrl.replace(/\/$/, ""),
  };
  const secret = process.env.HOST_INTERNAL_SECRET?.trim();
  if (secret) {
    env.HOST_INTERNAL_SECRET = secret;
  }
  return env;
}

export function buildGamearenaEnv(
  agentPrivateKey: `0x${string}` | null,
  rpcUrl: string,
  config: SkillConfiguration,
  agentAddress: Address,
): Record<string, string> {
  const playMode = config.PLAY_MODE ?? "offchain";
  if (playMode === "onchain" && !agentPrivateKey) {
    throw new Error("gamearena-player on-chain mode requires agent private key");
  }
  if (playMode === "auto" && !agentPrivateKey) {
    throw new Error("gamearena-player auto mode requires agent private key");
  }

  const env: Record<string, string> = {
    PLAY_MODE: playMode,
    MARKOV_STRATEGY: config.MARKOV_STRATEGY ?? "random",
    RPS_SEQUENCE: config.RPS_SEQUENCE ?? "rock,paper,scissors",
    RPS_FIXED: config.RPS_FIXED ?? "rock",
    PLAYER_ADDRESS: config.PLAYER_ADDRESS ?? agentAddress,
    CHALLENGE_AI_URL: config.CHALLENGE_AI_URL ?? "https://gamearenahq.xyz",
    CELO_RPC_URL: config.CELO_RPC_URL ?? rpcUrl,
    DAILY_MATCH_CAP: config.DAILY_MATCH_CAP ?? "50",
    AUTO_REFILL: config.AUTO_REFILL ?? "1",
    DAILY_REFILL_CAP_GS: config.DAILY_REFILL_CAP_GS ?? "20",
    MAX_REFILLS_PER_DAY: config.MAX_REFILLS_PER_DAY ?? "10",
    WAGER_GS: config.WAGER_GS ?? "1",
    GAME_TYPE: config.GAME_TYPE ?? "0",
    DAILY_LOSS_CAP_GS: config.DAILY_LOSS_CAP_GS ?? "20",
    ACCEPT_TIMEOUT_SECONDS: config.ACCEPT_TIMEOUT_SECONDS ?? "90",
    RESOLVE_TIMEOUT_SECONDS: config.RESOLVE_TIMEOUT_SECONDS ?? "120",
    ACCEPT_POLL_SECONDS: config.ACCEPT_POLL_SECONDS ?? "5",
    MAX_MATCHES: config.MAX_MATCHES ?? "10",
    MATCH_INTERVAL_SECONDS: config.MATCH_INTERVAL_SECONDS ?? "300",
  };
  if (agentPrivateKey) {
    env.PRIVATE_KEY = agentPrivateKey;
  }
  return env;
}

export function buildActionorderEnv(
  agentAddress: Address,
  displayName: string,
  config: SkillConfiguration,
): Record<string, string> {
  return {
    PLAYER_ADDRESS: agentAddress,
    PLAYER_NAME: config.PLAYER_NAME ?? displayName,
    CHARACTER_ID: config.CHARACTER_ID ?? "riven",
    STRATEGY: config.STRATEGY ?? "anti_strike",
    DIFFICULTY: config.DIFFICULTY ?? "0",
    PREMIUM_CARDS: config.PREMIUM_CARDS ?? "",
    MAX_MATCHES: config.MAX_MATCHES ?? "5",
    DAILY_MATCH_CAP: config.DAILY_MATCH_CAP ?? "50",
    MATCH_INTERVAL_SECONDS: config.MATCH_INTERVAL_SECONDS ?? "10",
    ACTIONORDER_URL: config.ACTIONORDER_URL ?? "https://www.actionorder.xyz",
  };
}

export const UBI_REMINDER_SKILL_ID = "social/reminder/ubi_claim_reminder";
export const BALAIO_WORKER_SKILL_ID = "work/marketplace/balaio_worker";

const BALAIO_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhemF3dGFqYnB6aHBsdnR1amVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NjI0MjYsImV4cCI6MjA4MTAzODQyNn0.m1lboja6h24zePQexzWSY9MeC4WyLGa_kQvKbJxPmVg";

export function buildUbiReminderEnv(
  agentAddress: Address,
  displayName: string,
  rpcUrl: string,
  config: SkillConfiguration,
  telegramBotToken: string | null,
): Record<string, string> {
  if (!telegramBotToken) {
    throw new Error(
      "ubi-reminder requires a Telegram bot token (create one with @BotFather)",
    );
  }
  return {
    TELEGRAM_BOT_TOKEN: telegramBotToken,
    AGENT_ADDRESS: agentAddress,
    BOT_NAME: config.BOT_NAME ?? displayName,
    CELO_RPC_URL: config.CELO_RPC_URL ?? rpcUrl,
    REMINDER_INTERVAL_MINUTES: config.REMINDER_INTERVAL_MINUTES ?? "15",
    IDENTITY_EXPIRY_WARN_DAYS: config.IDENTITY_EXPIRY_WARN_DAYS ?? "14",
  };
}

export function buildBalaioEnv(
  agentPrivateKey: `0x${string}` | null,
  rpcUrl: string,
  config: SkillConfiguration,
  agentAddress: Address,
  apiBase: string,
): Record<string, string> {
  if (!agentPrivateKey) {
    throw new Error("balaio-worker requires agent private key");
  }
  const verifyBase =
    config.GOODAGENT_VERIFY_BASE ??
    `${apiBase.replace(/\/$/, "")}/agent/verify?agent=`;
  const escrowBudget = estimateBalaioEscrowBudgetGs(config);
  return {
    PRIVATE_KEY: agentPrivateKey,
    AGENT_ADDRESS: agentAddress,
    CELO_RPC_URL: config.CELO_RPC_URL ?? rpcUrl,
    BALAIO_API_BASE: config.BALAIO_API_BASE ?? "https://www.usebalaio.com",
    BALAIO_CONTRACT:
      config.BALAIO_CONTRACT ?? "0xe60aa33E8Dee3Bb1B2218bF025AcB624312D519E",
    BALAIO_SUPABASE_URL:
      config.BALAIO_SUPABASE_URL ?? "https://lazawtajbpzhplvtujej.supabase.co",
    BALAIO_SUPABASE_ANON_KEY:
      config.BALAIO_SUPABASE_ANON_KEY ?? BALAIO_SUPABASE_ANON_KEY,
    ENABLE_WORKER: config.ENABLE_WORKER ?? "1",
    ENABLE_CREATE: config.ENABLE_CREATE ?? "0",
    ENABLE_APPROVE: config.ENABLE_APPROVE ?? "0",
    SCAN_INTERVAL_SECONDS: config.SCAN_INTERVAL_SECONDS ?? "300",
    MIN_REWARD: config.MIN_REWARD ?? "1",
    REWARD_TOKENS: config.REWARD_TOKENS ?? "G$,USDC,CELO,cUSD",
    MAX_TASKS_PER_RUN: config.MAX_TASKS_PER_RUN ?? "1",
    CREATE_TASK_ID: config.CREATE_TASK_ID ?? "",
    CREATE_TITLE: config.CREATE_TITLE ?? "",
    CREATE_DESCRIPTION: config.CREATE_DESCRIPTION ?? "",
    CREATE_REWARD: config.CREATE_REWARD ?? "",
    CREATE_SLOTS: config.CREATE_SLOTS ?? "1",
    CREATE_TOKEN: config.CREATE_TOKEN ?? "G$",
    CREATE_VISIBILITY: config.CREATE_VISIBILITY ?? "public",
    APPROVER_ADDRESS: config.APPROVER_ADDRESS ?? agentAddress,
    MAX_ESCROW_GS: config.MAX_ESCROW_GS ?? "500",
    MIN_WALLET_RESERVE_GS: config.MIN_WALLET_RESERVE_GS ?? "10",
    CREATE_ONCE: config.CREATE_ONCE ?? "1",
    CREATE_ESCROW_BUDGET_GS:
      config.CREATE_ESCROW_BUDGET_GS ??
      (escrowBudget > 0 ? String(escrowBudget) : ""),
    APPROVE_TASK_IDS: config.APPROVE_TASK_IDS ?? "",
    GOODAGENT_VERIFY_BASE: verifyBase,
  };
}

/** Escrow budget in G$ for creator-mode deploy funding (reward × slots × 1.02 incl. claim fee). */
export function estimateBalaioEscrowBudgetGs(config: SkillConfiguration): number {
  if (config.ENABLE_CREATE !== "1") return 0;
  const explicit = Number(config.CREATE_ESCROW_BUDGET_GS ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const reward = Number(config.CREATE_REWARD ?? 0);
  const slots = Math.max(1, Number(config.CREATE_SLOTS ?? 1));
  if (!Number.isFinite(reward) || reward <= 0) return 0;
  return Math.ceil(reward * slots * 1.02 * 100) / 100;
}

export function computeBalaioFundingGs(
  config: SkillConfiguration,
  baseGs: number,
): number {
  return baseGs + estimateBalaioEscrowBudgetGs(config);
}

export function buildSkillEnv(
  skillId: string,
  opts: {
    deployId: string;
    agentAddress: Address;
    agentPrivateKey: `0x${string}` | null;
    rpcUrl: string;
    displayName: string;
    config: SkillConfiguration;
    telegramBotToken?: string | null;
    apiBase?: string;
  },
): Record<string, string> {
  let env: Record<string, string>;
  if (skillId === "gaming/wagering/gamearena_1v1") {
    env = buildGamearenaEnv(
      opts.agentPrivateKey,
      opts.rpcUrl,
      opts.config,
      opts.agentAddress,
    );
  } else if (skillId === "gaming/card-fighter/actionorder_vshouse") {
    env = buildActionorderEnv(opts.agentAddress, opts.displayName, opts.config);
  } else if (skillId === UBI_REMINDER_SKILL_ID) {
    env = buildUbiReminderEnv(
      opts.agentAddress,
      opts.displayName,
      opts.rpcUrl,
      opts.config,
      opts.telegramBotToken ?? null,
    );
  } else if (skillId === BALAIO_WORKER_SKILL_ID) {
    env = buildBalaioEnv(
      opts.agentPrivateKey,
      opts.rpcUrl,
      opts.config,
      opts.agentAddress,
      opts.apiBase ?? GOODAGENT_API_URL,
    );
  } else {
    throw new Error(`Unsupported skill_id for env: ${skillId}`);
  }
  const merged = { ...env, ...buildHostReportEnv(opts.deployId) };
  if (skillId === "gaming/wagering/gamearena_1v1") {
    const proxy = resolveGamearenaProxy(opts.deployId, opts.config);
    if (proxy) merged.GAMEARENA_PROXY = proxy;
  }
  return merged;
}
