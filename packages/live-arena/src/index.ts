export type {
  GameArenaLiveMatch,
  GameArenaLivePhase,
} from "./live.js";
export {
  GAMEARENA_SKILL_ID,
  inferLiveMatchFromLogTail,
  isGamearenaSkill,
  matchOutcomeHeadline,
  pickArenaLiveDisplay,
  resolveLiveMatchDisplay,
  roundResultLabel,
  rpsMoveName,
  shouldFastPollLiveArena,
} from "./live.js";

export type { GameArenaSseEvent } from "./sse.js";
export {
  extractArenaMatchIdFromLog,
  gameArenaLiveSseUrl,
  mapGameArenaSseEvent,
  parseGameArenaSsePayload,
  resolveActiveSseMatchId,
  resolveHostBaseUrl,
} from "./sse.js";

export type { GameArenaSseStatus } from "./useGameArenaLiveSSE.js";
export { useGameArenaLiveSSE } from "./useGameArenaLiveSSE.js";

export type {
  ArenaLiveSpectatorInput,
  LiveFeedState,
} from "./useArenaLiveSpectator.js";
export { useArenaLiveSpectator } from "./useArenaLiveSpectator.js";

export {
  GameArenaLiveArena,
  GameArenaLiveSection,
  GameArenaLiveWaiting,
} from "./GameArenaLiveArena.js";
