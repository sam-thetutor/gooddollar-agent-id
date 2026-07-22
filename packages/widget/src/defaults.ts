import {
  GOODAGENT_API_URL,
  GOODAGENT_HOST_URL,
  GOODAGENT_SITE_ORIGIN,
} from "./public-urls.js";
import type { GoodAgentWidgetConfig } from "./types.js";

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

/**
 * Build a widget config with canonical goodagentids.xyz API URLs.
 * Pass `skillId` + optional overrides (`partnerId`, `skillConfiguration`, …).
 */
export function createGoodAgentWidgetConfig(
  skillId: string,
  overrides: Omit<
    GoodAgentWidgetConfig,
    "skillId" | "hostBaseUrl" | "apiBaseUrl"
  > &
    Partial<Pick<GoodAgentWidgetConfig, "hostBaseUrl" | "apiBaseUrl">> = {},
): GoodAgentWidgetConfig {
  return {
    ...DEFAULT_WIDGET_API,
    skillId,
    ...overrides,
  };
}
