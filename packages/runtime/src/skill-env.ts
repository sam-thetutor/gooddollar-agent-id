import { chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";
import { ACTIONORDER_DEFAULT_URL, GOODAGENT_API_URL } from "@goodagent/shared";
import {
  PROOF_OF_ALPHA_DEFAULT_URL,
  PROOF_OF_ALPHA_HUNT_SKILL_ID,
} from "@goodagent/shared";
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
    ROUND_PACE_MS: config.ROUND_PACE_MS ?? "1000",
  };
  if (agentPrivateKey) {
    env.PRIVATE_KEY = agentPrivateKey;
  }
  Object.assign(env, resolveGamearenaAgentApiEnv());
  return env;
}

/** Host-level scoped GameArena play key — injected into agent skill env, not user deploy config. */
export function resolveGamearenaAgentApiEnv(): Record<string, string> {
  const apiKey = process.env.GAMEARENA_AGENT_API_KEY?.trim();
  if (!apiKey) return {};
  const apiUrl =
    process.env.GAMEARENA_AGENT_API_URL?.trim()?.replace(/\/$/, "") ||
    "https://game-backend-production-6130.up.railway.app";
  return {
    GAMEARENA_AGENT_API_KEY: apiKey,
    GAMEARENA_AGENT_API_URL: apiUrl,
  };
}

export function buildPlaychessifyEnv(
  agentPrivateKey: `0x${string}` | null,
  rpcUrl: string,
  config: SkillConfiguration,
  agentAddress: Address,
  displayName: string,
): Record<string, string> {
  if (!agentPrivateKey) {
    throw new Error("playchessify-player requires agent private key");
  }
  return {
    PRIVATE_KEY: agentPrivateKey,
    PLAYER_ADDRESS: agentAddress,
    PLAYER_NAME: config.PLAYER_NAME ?? displayName,
    CELO_RPC_URL: config.CELO_RPC_URL ?? rpcUrl,
    PLAYCHESSIFY_URL: config.PLAYCHESSIFY_URL ?? "https://celo.playchessify.xyz",
    CHESS_TOKEN:
      config.CHESS_TOKEN ?? "0x3f7efdfc8a76f76f22512fcd2bddc5fca36e55a3",
    CHESS_GAME:
      config.CHESS_GAME ?? "0xb37877a9ebd6c3169b2eaaa3e16852839785ae85",
    STRATEGY_PRESET: config.STRATEGY_PRESET ?? "balanced",
    PLAY_MODE: config.PLAY_MODE ?? "bot",
    MAX_WAGER: config.MAX_WAGER ?? "100",
    HOST_WAGER: config.HOST_WAGER ?? config.MAX_WAGER ?? "100",
    JOIN_GAME_ID: config.JOIN_GAME_ID ?? "",
    JOIN_WAIT_MS: config.JOIN_WAIT_MS ?? "540000",
    TARGET_BOT_MIN_ELO: config.TARGET_BOT_MIN_ELO ?? "600",
    TARGET_BOT_MAX_ELO: config.TARGET_BOT_MAX_ELO ?? "1200",
    MAX_MATCHES: config.MAX_MATCHES ?? "3",
    DAILY_MATCH_CAP: config.DAILY_MATCH_CAP ?? "20",
    MATCH_INTERVAL_SECONDS: config.MATCH_INTERVAL_SECONDS ?? "60",
    MOVE_POLL_MS: config.MOVE_POLL_MS ?? "1500",
    THINK_DELAY_MS: config.THINK_DELAY_MS ?? "2500",
  };
}

export function buildActionorderEnv(
  agentAddress: Address,
  displayName: string,
  config: SkillConfiguration,
): Record<string, string> {
  const env: Record<string, string> = {
    PLAYER_ADDRESS: agentAddress,
    PLAYER_NAME: config.PLAYER_NAME ?? displayName,
    CHARACTER_ID: config.CHARACTER_ID ?? "riven",
    STRATEGY: config.STRATEGY ?? "anti_strike",
    DIFFICULTY: config.DIFFICULTY ?? "0",
    PREMIUM_CARDS: config.PREMIUM_CARDS ?? "",
    MAX_MATCHES: config.MAX_MATCHES ?? "5",
    DAILY_MATCH_CAP: config.DAILY_MATCH_CAP ?? "50",
    MATCH_INTERVAL_SECONDS: config.MATCH_INTERVAL_SECONDS ?? "10",
    ACTIONORDER_URL: config.ACTIONORDER_URL ?? ACTIONORDER_DEFAULT_URL,
  };
  const agentApiKey =
    config.ACTIONORDER_AGENT_API_KEY?.trim() ||
    process.env.ACTIONORDER_AGENT_API_KEY?.trim();
  if (agentApiKey) env.ACTIONORDER_AGENT_API_KEY = agentApiKey;
  return env;
}

export function buildProofOfAlphaHuntEnv(
  agentAddress: Address,
  displayName: string,
  config: SkillConfiguration,
): Record<string, string> {
  return {
    PLAYER_ADDRESS: agentAddress,
    PLAYER_NAME: config.PLAYER_NAME ?? displayName,
    POA_API_URL: config.POA_API_URL ?? PROOF_OF_ALPHA_DEFAULT_URL,
    ETHERSCAN_API_KEY:
      config.ETHERSCAN_API_KEY?.trim() ||
      process.env.ETHERSCAN_API_KEY?.trim() ||
      "",
    ETHERSCAN_TX_LIMIT: config.ETHERSCAN_TX_LIMIT ?? "40",
    FORENSIC_PREVIEW_COUNT: config.FORENSIC_PREVIEW_COUNT ?? "3",
    DRY_RUN: config.DRY_RUN ?? "0",
  };
}

export { PROOF_OF_ALPHA_HUNT_SKILL_ID };

export const UBI_REMINDER_SKILL_ID = "social/reminder/ubi_claim_reminder";
export const BALAIO_WORKER_SKILL_ID = "work/marketplace/balaio_worker";
export const PLAYCHESSIFY_SKILL_ID = "gaming/wagering/playchessify_1v1";
export const CHESS_ARENA_SKILL_ID = "gaming/wagering/chess_arena_1v1";
/** Covers ~1 USDT swap (~9k G$ at current Uniswap rates) plus headroom. */
export const CHESS_ARENA_MIN_FUNDING_GS = 9_000;

/** Bundled Stockfish wrapper (skill cwd = install dir). */
export const CHESS_ARENA_DEFAULT_SOLVER_CMD = "node scripts/stockfish-solver.mjs";

export function resolveChessArenaSolverCmd(
  config: SkillConfiguration,
): string | undefined {
  const engine = (config.SOLVER_ENGINE ?? "stockfish").trim().toLowerCase();
  if (engine === "basic" || engine === "off" || engine === "none") {
    return undefined;
  }
  const custom = config.SOLVER_CMD?.trim();
  if (custom) return custom;
  return CHESS_ARENA_DEFAULT_SOLVER_CMD;
}

export function buildChessArenaEnv(
  agentPrivateKey: `0x${string}` | null,
  rpcUrl: string,
  config: SkillConfiguration,
  agentAddress: Address,
  displayName: string,
): Record<string, string> {
  if (!agentPrivateKey) {
    throw new Error("chess-arena-player requires agent private key");
  }
  const env: Record<string, string> = {
    PRIVATE_KEY: agentPrivateKey,
    PLAYER_ADDRESS: agentAddress,
    PLAYER_NAME: config.PLAYER_NAME ?? displayName,
    CELO_RPC_URL: config.CELO_RPC_URL ?? rpcUrl,
    ARENA_URL: config.ARENA_URL ?? "https://arena.chesspuzzles.xyz",
    ARENA_CONTRACT:
      config.ARENA_CONTRACT ??
      "0x8fe68a574f0b8c2819897363195ed3d66fde4ec1",
    USDT_ADDRESS:
      config.USDT_ADDRESS ?? "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    AUTO_SWAP: config.AUTO_SWAP ?? "1",
    MIN_GS_RESERVE: config.MIN_GS_RESERVE ?? "50",
    USDT_STAKE_BUFFER: config.USDT_STAKE_BUFFER ?? "1000000",
    PLAY_MODE: config.PLAY_MODE ?? "auto",
    MAX_MATCHES: config.MAX_MATCHES ?? "5",
    DAILY_MATCH_CAP: config.DAILY_MATCH_CAP ?? "20",
    MATCH_INTERVAL_SECONDS: config.MATCH_INTERVAL_SECONDS ?? "120",
    SOLVER_ENGINE: config.SOLVER_ENGINE ?? "stockfish",
  };
  const solverCmd = resolveChessArenaSolverCmd(config);
  if (solverCmd) {
    env.SOLVER_CMD = solverCmd;
    env.SOLVER_MOVETIME_MS = config.SOLVER_MOVETIME_MS ?? "450";
  }
  return env;
}

export function computeChessArenaFundingGs(baseGs: number): number {
  return Math.max(baseGs, CHESS_ARENA_MIN_FUNDING_GS);
}
export const PRODUCTCLANK_SKILL_ID = "work/social/productclank_participant";

export function buildProductClankEnv(
  agentPrivateKey: `0x${string}` | null,
  agentAddress: Address,
  config: SkillConfiguration,
): Record<string, string> {
  const apiKey = config.PRODUCTCLANK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "productclank-participant requires PRODUCTCLANK_API_KEY (auto-registration may have failed — check the deploy logs)",
    );
  }
  const xHandle = config.X_HANDLE?.trim().replace(/^@/, "");
  if (!xHandle) {
    throw new Error("productclank-participant requires X_HANDLE");
  }
  const env: Record<string, string> = {
    PRODUCTCLANK_API_KEY: apiKey,
    X_HANDLE: xHandle,
    AGENT_ADDRESS: agentAddress,
    LLM_BASE_URL: config.LLM_BASE_URL ?? "http://localhost:8377/v1",
    SCAN_INTERVAL_SECONDS: config.SCAN_INTERVAL_SECONDS ?? "1800",
    DAILY_SUBMIT_CAP: config.DAILY_SUBMIT_CAP ?? "10",
    MAX_PENDING_DRAFTS: config.MAX_PENDING_DRAFTS ?? "5",
    ENABLE_PRO_CLAIM: config.ENABLE_PRO_CLAIM ?? "0",
    STATE_FILE: "./state.json",
    QUEUE_FILE: "./amplify-queue.json",
  };
  if (config.LLM_MODEL?.trim()) env.LLM_MODEL = config.LLM_MODEL.trim();
  if (config.ERC8004_AGENT_ID?.trim())
    env.ERC8004_AGENT_ID = config.ERC8004_AGENT_ID.trim();
  // Only needed for on-chain $PRO claims; harmless to include.
  if (agentPrivateKey) env.PRIVATE_KEY = agentPrivateKey;
  return env;
}

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
      { ...opts.config, PLAYER_NAME: opts.config.PLAYER_NAME ?? opts.displayName },
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
  } else if (skillId === PLAYCHESSIFY_SKILL_ID) {
    env = buildPlaychessifyEnv(
      opts.agentPrivateKey,
      opts.rpcUrl,
      opts.config,
      opts.agentAddress,
      opts.displayName,
    );
  } else if (skillId === CHESS_ARENA_SKILL_ID) {
    env = buildChessArenaEnv(
      opts.agentPrivateKey,
      opts.rpcUrl,
      opts.config,
      opts.agentAddress,
      opts.displayName,
    );
  } else if (skillId === PROOF_OF_ALPHA_HUNT_SKILL_ID) {
    env = buildProofOfAlphaHuntEnv(
      opts.agentAddress,
      opts.displayName,
      opts.config,
    );
  } else if (skillId === PRODUCTCLANK_SKILL_ID) {
    env = buildProductClankEnv(
      opts.agentPrivateKey,
      opts.agentAddress,
      opts.config,
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
