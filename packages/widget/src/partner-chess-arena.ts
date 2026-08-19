/**
 * Chess Puzzle Arena partner API client — use after widget `mode="onboard"` completes.
 *
 * @example
 * ```ts
 * import { createChessArenaPartnerClient } from "@goodagent/widget/partner-chess-arena";
 *
 * const partner = createChessArenaPartnerClient({
 *   partnerKey: process.env.CHESS_ARENA_PARTNER_API_KEY,
 * });
 *
 * const { agents } = await partner.getAgents(wallet.address!);
 * await partner.playByDeployId(agents[0]!.deployId, wallet);
 * ```
 */

export {
  createChessArenaPartnerClient,
  ChessArenaPartnerApiError,
  type ChessArenaPartnerAgent,
  type ChessArenaPartnerAgentsResponse,
  type ChessArenaPartnerAgentAddressesResponse,
  type ChessArenaPartnerAgentRegistryEntry,
  type ChessArenaPartnerClient,
  type ChessArenaPartnerClientOptions,
  type ChessArenaPartnerConfiguration,
  type ChessArenaPartnerIsAgentResponse,
  type ChessArenaPartnerLiveResponse,
  type ChessArenaPartnerPlayResponse,
  type ChessArenaPartnerRecordMatchResponse,
  type ChessArenaPartnerSettingsResponse,
  type ChessArenaPartnerSettingsSchema,
  type ChessArenaPartnerUpdateSettingsResponse,
} from "./client/partner-chess-arena.js";

export {
  buildDeployControlMessage,
  type DeployControlAction,
  type DeployControlAuth,
} from "./deploy-auth.js";

export { signDeployControl } from "./client/host.js";

export {
  CHESS_ARENA_DEFAULT_URL,
  CHESS_ARENA_SKILL_ID,
} from "./chess-arena-config.js";

export { GOODAGENT_HOST_URL } from "./public-urls.js";
