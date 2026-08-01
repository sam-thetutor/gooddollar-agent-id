import { useEffect, useMemo, useRef, useState } from "react";
import {
  inferLiveMatchFromLogTail,
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

  const displayedMatchIdsRef = useRef(new Set<string>());
  const [caughtUpReplay, setCaughtUpReplay] =
    useState<GameArenaLiveMatch | null>(null);

  useEffect(() => {
    if (!enabled || !logTail?.trim()) return;

    const inferred = inferLiveMatchFromLogTail(logTail, playerLabel);
    if (
      inferred &&
      (inferred.phase === "starting" || inferred.phase === "playing")
    ) {
      displayedMatchIdsRef.current.add(inferred.matchId);
      setCaughtUpReplay(null);
      return;
    }

    if (inferred?.phase !== "ended") return;

    if (displayedMatchIdsRef.current.has(inferred.matchId)) return;

    displayedMatchIdsRef.current.add(inferred.matchId);
    setCaughtUpReplay(inferred);
  }, [enabled, logTail, playerLabel]);

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
    () => {
      if (!enabled) return null;
      const picked = pickArenaLiveDisplay({
        sseLive,
        hostLive: liveMatch,
        logFallback: liveDisplayFallback,
        agentLive,
        hasActiveSseTarget: Boolean(
          sseMatchId ||
            activeArenaMatchId ||
            liveDisplayFallback?.phase === "starting" ||
            liveDisplayFallback?.phase === "playing",
        ),
      });
      if (
        picked &&
        (picked.phase === "starting" || picked.phase === "playing")
      ) {
        return picked;
      }
      if (caughtUpReplay) return caughtUpReplay;
      return picked;
    },
    [
      enabled,
      sseLive,
      liveMatch,
      liveDisplayFallback,
      agentLive,
      sseMatchId,
      activeArenaMatchId,
      caughtUpReplay,
    ],
  );

  const liveFeedState = useMemo((): LiveFeedState => {
    if (!enabled) return "idle";
    if (
      sseLive?.phase === "starting" ||
      sseLive?.phase === "playing" ||
      liveMatch?.phase === "starting" ||
      liveMatch?.phase === "playing" ||
      liveDisplay?.phase === "starting" ||
      liveDisplay?.phase === "playing"
    ) {
      return "live";
    }
    if (sseStatus === "connecting" && sseMatchId) return "connecting";
    if (sseStatus === "error" && liveDisplay) {
      return liveDisplay.phase === "ended" ? "replay" : "live";
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
    if (sseStatus === "error" && liveDisplay) {
      return liveDisplay.phase === "ended"
        ? "Last match (host snapshot)"
        : "Host snapshot (feed unavailable)";
    }
    if (sseStatus === "connected" || liveFeedState === "live") {
      return "GameArena live feed";
    }
    if (sseStatus === "ended") return "Match finished";
    if (sseStatus === "idle" && sseMatchId) return "Waiting for feed…";
    if (sseStatus === "error") return sseError ?? "Feed error";
    if (liveFeedState === "replay") return "Last match (log replay)";
    return null;
  }, [
    enabled,
    liveFeedState,
    sseStatus,
    sseMatchId,
    sseError,
    liveDisplay,
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
