import { useMemo } from "react";
import {
  pickArenaLiveDisplay,
  resolveLiveMatchDisplay,
  type GameArenaLiveMatch,
} from "./live.js";
import { resolveActiveSseMatchId } from "./sse.js";
import {
  useGameArenaLiveSSE,
  type GameArenaSseStatus,
} from "./useGameArenaLiveSSE.js";

export type LiveFeedState =
  | "connecting"
  | "live"
  | "waiting"
  | "replay"
  | "idle";

export interface ArenaLiveSpectatorInput {
  enabled: boolean;
  hostBaseUrl?: string;
  debugMatchId?: string | null;
  activeArenaMatchId?: string | null;
  liveMatch?: GameArenaLiveMatch | null;
  logTail?: string | null;
  playerLabel?: string;
  agentLive: boolean;
}

export function useArenaLiveSpectator(input: ArenaLiveSpectatorInput) {
  const {
    enabled,
    hostBaseUrl,
    debugMatchId,
    activeArenaMatchId,
    liveMatch,
    logTail,
    playerLabel,
    agentLive,
  } = input;

  const liveDisplayFallback = useMemo(
    () =>
      enabled
        ? resolveLiveMatchDisplay({ liveMatch, logTail, playerLabel })
        : null,
    [enabled, liveMatch, logTail, playerLabel],
  );

  const sseMatchId = useMemo(
    () =>
      enabled
        ? resolveActiveSseMatchId({
            debugMatchId,
            activeArenaMatchId,
            liveMatch,
            logTail,
            playerLabel,
          })
        : null,
    [
      enabled,
      debugMatchId,
      activeArenaMatchId,
      liveMatch,
      logTail,
      playerLabel,
    ],
  );

  const { live: sseLive, status: sseStatus, error: sseError } =
    useGameArenaLiveSSE(
      enabled ? sseMatchId : null,
      playerLabel,
      hostBaseUrl,
    );

  const liveDisplay = useMemo(
    () =>
      enabled
        ? pickArenaLiveDisplay({
            sseLive,
            hostLive: liveMatch,
            logFallback: liveDisplayFallback,
            agentLive,
            hasActiveSseTarget: Boolean(sseMatchId || activeArenaMatchId),
          })
        : null,
    [
      enabled,
      sseLive,
      liveMatch,
      liveDisplayFallback,
      agentLive,
      sseMatchId,
      activeArenaMatchId,
    ],
  );

  const liveFeedState = useMemo((): LiveFeedState => {
    if (!enabled) return "idle";
    if (sseStatus === "connecting" && sseMatchId) return "connecting";
    if (
      sseLive?.phase === "starting" ||
      sseLive?.phase === "playing" ||
      liveMatch?.phase === "starting" ||
      liveMatch?.phase === "playing"
    ) {
      return "live";
    }
    if (agentLive && !liveDisplay) return "waiting";
    if (liveDisplay?.phase === "ended") return "replay";
    if (liveDisplay) return sseMatchId ? "live" : "replay";
    return "idle";
  }, [
    enabled,
    sseStatus,
    sseMatchId,
    sseLive,
    liveMatch,
    agentLive,
    liveDisplay,
  ]);

  const sseBadgeLabel = useMemo(() => {
    if (!enabled) return null;
    if (liveFeedState === "waiting") return "Standing by";
    if (liveFeedState === "connecting") return "Connecting to GameArena…";
    if (sseStatus === "connected" || liveFeedState === "live") {
      return "GameArena live feed";
    }
    if (sseStatus === "ended") return "Match finished";
    if (sseStatus === "idle" && sseMatchId) return "Waiting for feed…";
    if (liveFeedState === "replay") return "Last match (log replay)";
    if (sseStatus === "error") return sseError ?? "Feed error";
    return null;
  }, [
    enabled,
    liveFeedState,
    sseStatus,
    sseMatchId,
    sseError,
  ]);

  const arenaActive =
    liveDisplay?.phase === "starting" || liveDisplay?.phase === "playing";

  const waitingForArena =
    liveFeedState === "waiting" || liveFeedState === "connecting";

  return {
    sseMatchId,
    sseLive,
    sseStatus: sseStatus as GameArenaSseStatus,
    sseError,
    liveDisplay,
    liveFeedState,
    sseBadgeLabel,
    arenaActive,
    waitingForArena,
  };
}
