import { AGENT_VAULT_ADDRESS } from "./agent-id.js";
import { buildFvCallbackUrl } from "./gooddollar.js";
import {
  GOODAGENT_API_URL,
  GOODAGENT_HOST_URL,
  GOODAGENT_SITE_ORIGIN,
} from "./public-urls.js";
import { DEFAULT_REGISTRY_URL } from "./skill-registry.js";
import {
  defaultConfigForSkill,
  defaultDisplayNameForSkill,
  deployHintForSkill,
  deployTemplateForSkill,
  GAMEARENA_SKILL_ID,
  CHESS_ARENA_SKILL_ID,
  PROOF_OF_ALPHA_DEFAULT_URL,
  PROOF_OF_ALPHA_HUNT_SKILL_ID,
  skillShortLabel,
} from "./skill-config.js";
import { defaultChessArenaConfig } from "./chess-arena-config.js";
import type {
  GoodAgentWidgetConfig,
  GoodAgentWidgetPartnerConfig,
  SkillConfiguration,
  SkillSelectionMode,
} from "./types.js";

export {
  GOODAGENT_API_URL,
  GOODAGENT_HOST_URL,
  GOODAGENT_SITE_ORIGIN,
};

/** Default API endpoints for embeds (GameArena, partners, etc.). */
export const DEFAULT_WIDGET_API = {
  hostBaseUrl: GOODAGENT_HOST_URL,
  apiBaseUrl: GOODAGENT_API_URL,
} as const;

export const DEFAULT_WIDGET_RPC = "https://forno.celo.org";
export const DEFAULT_STATUS_POLL_MS = 4000;

/** Merge partner input with all static GoodAgent defaults. */
export function resolveWidgetConfig(
  input: GoodAgentWidgetPartnerConfig,
): GoodAgentWidgetConfig {
  const skillSelection: SkillSelectionMode =
    input.skillSelection ?? "fixed";
  if (skillSelection === "fixed" && !input.skillId) {
    throw new Error(
      "GoodAgent widget: skillId is required when skillSelection is fixed",
    );
  }
  const skillId =
    input.skillId ??
    input.defaultSkillId ??
    input.allowedSkillIds?.[0] ??
    GAMEARENA_SKILL_ID;

  const skillConfiguration: SkillConfiguration = {
    ...defaultConfigForSkill(skillId),
    ...input.skillConfiguration,
  };

  return {
    hostBaseUrl: input.hostBaseUrl ?? DEFAULT_WIDGET_API.hostBaseUrl,
    apiBaseUrl: input.apiBaseUrl ?? DEFAULT_WIDGET_API.apiBaseUrl,
    rpcUrl: input.rpcUrl ?? DEFAULT_WIDGET_RPC,
    skillSelection,
    allowedSkillIds: input.allowedSkillIds,
    defaultSkillId: input.defaultSkillId ?? skillId,
    skillId,
    skillConfiguration,
    defaultDisplayName:
      input.defaultDisplayName ?? defaultDisplayNameForSkill(skillId),
    deployTemplate:
      input.deployTemplate ?? deployTemplateForSkill(skillId),
    hideSkillConfig: input.hideSkillConfig ?? false,
    deployHint: input.deployHint ?? deployHintForSkill(skillId),
    skillLabel: input.skillLabel ?? skillShortLabel(skillId),
    partnerId: input.partnerId,
    telegramBotToken: input.telegramBotToken,
    vaultAddress: input.vaultAddress ?? AGENT_VAULT_ADDRESS,
    goodDollarEnv: input.goodDollarEnv ?? "production",
    fvCallbackUrl: buildFvCallbackUrl(input.fvCallbackUrl),
    statusPollMs: input.statusPollMs ?? DEFAULT_STATUS_POLL_MS,
    registryUrl: input.registryUrl ?? DEFAULT_REGISTRY_URL,
  };
}

/**
 * Build widget config — static URLs and skill defaults are applied automatically.
 * @example createGoodAgentWidgetConfig(GAMEARENA_SKILL_ID, { partnerId: "gamearena" })
 */
export function createGoodAgentWidgetConfig(
  skillId: string,
  overrides: Omit<GoodAgentWidgetPartnerConfig, "skillId"> = {},
): GoodAgentWidgetConfig {
  return resolveWidgetConfig({ skillId, ...overrides });
}

/**
 * Preset for GameArena free offchain MARKOV agents — minimal partner setup.
 * For GameArena native UI, embed with `mode="onboard"` and use the partner API
 * after `onOnboardComplete`. Other partners should use `mode="full"` (default).
 */
export function createGameArenaWidgetConfig(
  opts: {
    partnerId: string;
    skillLabel?: string;
    defaultDisplayName?: string;
    fvCallbackUrl?: string;
    hideSkillConfig?: boolean;
    deployHint?: string;
    skillConfiguration?: SkillConfiguration;
  },
): GoodAgentWidgetConfig {
  return resolveWidgetConfig({
    skillId: GAMEARENA_SKILL_ID,
    partnerId: opts.partnerId,
    skillLabel: opts.skillLabel,
    defaultDisplayName: opts.defaultDisplayName ?? "My Arena Agent",
    hideSkillConfig: opts.hideSkillConfig ?? false,
    deployHint:
      opts.deployHint ??
      "Deploy an agent that plays free MARKOV matches on GameArena. Your wallet owns it — we run the bot.",
    fvCallbackUrl: opts.fvCallbackUrl,
    skillConfiguration: {
      PLAY_MODE: "offchain",
      MARKOV_STRATEGY: "random",
      DAILY_MATCH_CAP: "50",
      MAX_MATCHES: "10",
      MATCH_INTERVAL_SECONDS: "300",
      GAME_TYPE: "0",
      ...opts.skillConfiguration,
    },
  });
}

/**
 * Preset for Proof of Alpha daily hunt agents — deploy, verify, auto-submit to Alpha Hunt.
 */
export function createProofOfAlphaWidgetConfig(
  opts: {
    partnerId: string;
    skillLabel?: string;
    defaultDisplayName?: string;
    fvCallbackUrl?: string;
    hideSkillConfig?: boolean;
    deployHint?: string;
    skillConfiguration?: SkillConfiguration;
  },
): GoodAgentWidgetConfig {
  return resolveWidgetConfig({
    skillId: PROOF_OF_ALPHA_HUNT_SKILL_ID,
    partnerId: opts.partnerId,
    skillLabel: opts.skillLabel ?? "Alpha Hunt",
    defaultDisplayName: opts.defaultDisplayName ?? "My Alpha Hunt Agent",
    hideSkillConfig: opts.hideSkillConfig ?? true,
    deployHint:
      opts.deployHint ??
      "Deploy an autonomous agent that hunts daily whale txs and submits to Alpha Hunt. Your wallet owns it — GoodAgent runs the bot.",
    fvCallbackUrl: opts.fvCallbackUrl,
    skillConfiguration: {
      POA_API_URL: PROOF_OF_ALPHA_DEFAULT_URL,
      ETHERSCAN_TX_LIMIT: "40",
      FORENSIC_PREVIEW_COUNT: "3",
      DRY_RUN: "0",
      ...opts.skillConfiguration,
    },
  });
}

/**
 * Preset for Chess Puzzle Arena agents — 1 USDT stakes, Stockfish solver, G$→USDT auto-swap.
 */
export function createChessArenaWidgetConfig(opts: {
  partnerId: string;
  skillLabel?: string;
  defaultDisplayName?: string;
  fvCallbackUrl?: string;
  hideSkillConfig?: boolean;
  deployHint?: string;
  skillConfiguration?: SkillConfiguration;
}): GoodAgentWidgetConfig {
  return resolveWidgetConfig({
    skillId: CHESS_ARENA_SKILL_ID,
    partnerId: opts.partnerId,
    skillLabel: opts.skillLabel ?? "Chess Puzzle Arena",
    defaultDisplayName: opts.defaultDisplayName ?? "My Chess Arena Agent",
    hideSkillConfig: opts.hideSkillConfig ?? false,
    deployHint:
      opts.deployHint ??
      "Deploy an agent that plays timed chess-puzzle battles on arena.chesspuzzles.xyz. Your wallet owns it — we fund USDT stakes and run the solver.",
    fvCallbackUrl: opts.fvCallbackUrl,
    skillConfiguration: {
      ...defaultChessArenaConfig(),
      ...opts.skillConfiguration,
    },
  });
}

/** Multi-skill embed — user picks any listed skill from the registry (optionally filtered). */
export function createMarketplaceWidgetConfig(opts: {
  partnerId: string;
  allowedSkillIds?: string[];
  defaultSkillId?: string;
  defaultDisplayName?: string;
  fvCallbackUrl?: string;
  hideSkillConfig?: boolean;
  deployHint?: string;
  skillLabel?: string;
  registryUrl?: string;
  skillConfiguration?: SkillConfiguration;
}): GoodAgentWidgetConfig {
  return resolveWidgetConfig({
    skillSelection: "marketplace",
    partnerId: opts.partnerId,
    allowedSkillIds: opts.allowedSkillIds,
    defaultSkillId: opts.defaultSkillId,
    defaultDisplayName: opts.defaultDisplayName,
    hideSkillConfig: opts.hideSkillConfig,
    deployHint: opts.deployHint,
    skillLabel: opts.skillLabel,
    fvCallbackUrl: opts.fvCallbackUrl,
    registryUrl: opts.registryUrl,
    skillConfiguration: opts.skillConfiguration,
  });
}
