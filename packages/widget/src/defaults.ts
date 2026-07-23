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
  skillShortLabel,
} from "./skill-config.js";
import type {
  GoodAgentWidgetConfig,
  GoodAgentWidgetPartnerConfig,
  SkillConfiguration,
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
  const skillConfiguration: SkillConfiguration = {
    ...defaultConfigForSkill(input.skillId),
    ...input.skillConfiguration,
  };

  return {
    hostBaseUrl: input.hostBaseUrl ?? DEFAULT_WIDGET_API.hostBaseUrl,
    apiBaseUrl: input.apiBaseUrl ?? DEFAULT_WIDGET_API.apiBaseUrl,
    rpcUrl: input.rpcUrl ?? DEFAULT_WIDGET_RPC,
    skillId: input.skillId,
    skillConfiguration,
    defaultDisplayName:
      input.defaultDisplayName ?? defaultDisplayNameForSkill(input.skillId),
    deployTemplate:
      input.deployTemplate ?? deployTemplateForSkill(input.skillId),
    hideSkillConfig: input.hideSkillConfig ?? false,
    deployHint: input.deployHint ?? deployHintForSkill(input.skillId),
    skillLabel: input.skillLabel ?? skillShortLabel(input.skillId),
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

/** Preset for GameArena free offchain MARKOV agents — minimal partner setup. */
export function createGameArenaWidgetConfig(
  opts: {
    partnerId: string;
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
