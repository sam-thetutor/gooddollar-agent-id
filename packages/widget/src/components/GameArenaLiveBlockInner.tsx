import {
  GameArenaLiveSection,
  useArenaLiveSpectator,
  type GameArenaLiveMatch,
} from "@goodagent/live-arena";

export type GameArenaLiveBlockProps = {
  hostBaseUrl: string;
  activeArenaMatchId?: string | null;
  liveMatch?: GameArenaLiveMatch | null;
  logTail?: string | null;
  playerLabel: string;
  agentLive: boolean;
  title?: string;
};

export function GameArenaLiveBlockInner({
  hostBaseUrl,
  activeArenaMatchId,
  liveMatch,
  logTail,
  playerLabel,
  agentLive,
  title = "Live arena",
}: GameArenaLiveBlockProps) {
  const {
    sseMatchId,
    sseStatus,
    liveDisplay,
    liveFeedState,
    sseBadgeLabel,
  } = useArenaLiveSpectator({
    enabled: true,
    hostBaseUrl,
    activeArenaMatchId,
    liveMatch,
    logTail,
    playerLabel,
    agentLive,
  });

  return (
    <GameArenaLiveSection
      liveDisplay={liveDisplay}
      liveFeedState={liveFeedState}
      sseMatchId={sseMatchId}
      sseStatus={sseStatus}
      sseBadgeLabel={sseBadgeLabel}
      agentName={playerLabel}
      agentLive={agentLive}
      title={title}
    />
  );
}
