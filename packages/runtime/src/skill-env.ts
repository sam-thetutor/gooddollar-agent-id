import { chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";

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

  const env: Record<string, string> = {
    PLAY_MODE: playMode,
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

export function buildSkillEnv(
  skillId: string,
  opts: {
    deployId: string;
    agentAddress: Address;
    agentPrivateKey: `0x${string}` | null;
    rpcUrl: string;
    displayName: string;
    config: SkillConfiguration;
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
  } else {
    throw new Error(`Unsupported skill_id for env: ${skillId}`);
  }
  return { ...env, ...buildHostReportEnv(opts.deployId) };
}
