/**
 * GameArena partner API client — use after widget `mode="onboard"` completes.
 *
 * @example
 * ```ts
 * import { createGameArenaPartnerClient } from "@goodagent/widget/partner-gamearena";
 *
 * const partner = createGameArenaPartnerClient({
 *   partnerKey: process.env.GAMEARENA_PARTNER_API_KEY,
 * });
 *
 * const { agents } = await partner.getAgents(wallet.address!);
 * await partner.playByDeployId(agents[0]!.deployId, wallet);
 * ```
 */

export {
  createGameArenaPartnerClient,
  GameArenaPartnerApiError,
  type GameArenaPartnerAgent,
  type GameArenaPartnerAgentsResponse,
  type GameArenaPartnerClient,
  type GameArenaPartnerClientOptions,
  type GameArenaPartnerConfiguration,
  type GameArenaPartnerControlResponse,
  type GameArenaPartnerLiveResponse,
  type GameArenaPartnerPlayResponse,
  type GameArenaPartnerSettingsResponse,
  type GameArenaPartnerSettingsSchema,
  type GameArenaPartnerUpdateSettingsResponse,
} from "./client/partner-gamearena.js";

export {
  buildDeployControlMessage,
  type DeployControlAction,
  type DeployControlAuth,
} from "./deploy-auth.js";

export { signDeployControl } from "./client/host.js";

export { GOODAGENT_HOST_URL } from "./public-urls.js";
