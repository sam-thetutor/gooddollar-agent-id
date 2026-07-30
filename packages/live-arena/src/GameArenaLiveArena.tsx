import { useEffect, useRef, useState } from "react";
import type { GameArenaLiveMatch } from "./live.js";
import {
  matchOutcomeHeadline,
  roundResultLabel,
  rpsMoveName,
} from "./live.js";
import type { LiveFeedState } from "./useArenaLiveSpectator.js";

export type { LiveFeedState };

const RPS_EMOJI = ["✊", "✋", "✌️"] as const;

function rpsEmoji(move: number | undefined): string {
  if (move === 0) return RPS_EMOJI[0];
  if (move === 1) return RPS_EMOJI[1];
  if (move === 2) return RPS_EMOJI[2];
  return "❔";
}

function ScoreDots({
  wins,
  needed,
  tone,
  pulseWin,
}: {
  wins: number;
  needed: number;
  tone: "player" | "ai";
  pulseWin?: boolean;
}) {
  const n = Math.max(needed, wins, 1);
  return (
    <span className={`ga-live-dots ga-live-dots--${tone}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={[
            "ga-live-dot",
            i < wins ? "ga-live-dot--on" : "",
            pulseWin && i === wins - 1 ? "ga-live-dot--pop" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
    </span>
  );
}

export function GameArenaLiveWaiting({
  agentName,
  nextMatchIn,
  feedState,
}: {
  agentName?: string;
  nextMatchIn?: number | null;
  feedState: "connecting" | "waiting";
}) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setFrame((n) => n + 1), 550);
    return () => clearInterval(t);
  }, []);

  const emoji = RPS_EMOJI[frame % RPS_EMOJI.length]!;

  return (
    <div
      className={`ga-live-waiting ga-live-waiting--${feedState}`}
      aria-live="polite"
    >
      <div className="ga-live-waiting-ring" aria-hidden>
        <span className="ga-live-waiting-icon">{emoji}</span>
      </div>
      <p className="ga-live-waiting-title">
        {feedState === "connecting"
          ? "Connecting to GameArena…"
          : "Waiting for next match"}
      </p>
      <p className="ga-live-waiting-sub muted">
        {feedState === "connecting"
          ? "Opening the live spectator feed"
          : nextMatchIn != null && nextMatchIn > 0
            ? `Next match in ~${nextMatchIn}s`
            : `${agentName ?? "Agent"} is live — rounds stream here automatically`}
      </p>
      <div className="ga-live-waiting-track" aria-hidden>
        <span className="ga-live-waiting-track-fill" />
      </div>
    </div>
  );
}

export function GameArenaLiveArena({
  live,
  agentName,
  feedState = "live",
}: {
  live: GameArenaLiveMatch;
  agentName?: string;
  feedState?: LiveFeedState;
}) {
  const player = live.playerLabel ?? agentName ?? "Agent";
  const winsNeeded = live.winsNeeded ?? 3;
  const score = live.score ?? { player: 0, ai: 0, ties: 0 };
  const readPct =
    live.readLevel != null
      ? Math.min(100, Math.max(0, Math.round(live.readLevel)))
      : null;

  const prevRound = useRef<number | undefined>(undefined);
  const prevScore = useRef(score);
  const [roundFlash, setRoundFlash] = useState(false);
  const [pulsePlayerWin, setPulsePlayerWin] = useState(false);
  const [pulseAiWin, setPulseAiWin] = useState(false);

  useEffect(() => {
    if (live.round != null && live.round !== prevRound.current) {
      prevRound.current = live.round;
      setRoundFlash(true);
      const t = setTimeout(() => setRoundFlash(false), 700);
      return () => clearTimeout(t);
    }
  }, [live.round, live.updatedAt]);

  useEffect(() => {
    if (score.player > prevScore.current.player) {
      setPulsePlayerWin(true);
      const t = setTimeout(() => setPulsePlayerWin(false), 600);
      prevScore.current = score;
      return () => clearTimeout(t);
    }
    if (score.ai > prevScore.current.ai) {
      setPulseAiWin(true);
      const t = setTimeout(() => setPulseAiWin(false), 600);
      prevScore.current = score;
      return () => clearTimeout(t);
    }
    prevScore.current = score;
  }, [score.player, score.ai, score.ties]);

  const phaseLabel =
    live.phase === "starting"
      ? "Starting match…"
      : live.phase === "ended"
        ? matchOutcomeHeadline(live.final, player)
        : live.round != null
          ? `Round ${live.round}`
          : "Live vs MARKOV";

  const isLiveFeed = feedState === "live" || feedState === "connecting";
  const showThrowing =
    isLiveFeed &&
    live.phase === "playing" &&
    live.round != null &&
    !live.result;

  return (
    <div
      className={[
        "ga-live-arena",
        `ga-live-arena--${feedState}`,
        live.phase === "playing" ? "ga-live-arena--playing" : "",
        roundFlash ? "ga-live-arena--round-flash" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
    >
      {isLiveFeed && live.phase !== "ended" && (
        <div className="ga-live-scan" aria-hidden />
      )}

      <div className="ga-live-arena-head">
        <div>
          <p className="ga-live-eyebrow">
            {feedState === "replay" ? "Replay · Rock Paper Scissors" : "Live · Rock Paper Scissors"}
          </p>
          <h3 className="ga-live-title">{phaseLabel}</h3>
          {live.suddenDeath && live.phase === "playing" && (
            <p className="ga-live-sudden">Sudden death</p>
          )}
          {showThrowing && (
            <p className="ga-live-throwing">
              <span className="ga-live-throwing-dot" aria-hidden />
              Throwing…
            </p>
          )}
        </div>
        <div className="ga-live-scoreboard">
          <div className="ga-live-side">
            <span className="ga-live-name">{player}</span>
            <ScoreDots
              wins={score.player}
              needed={winsNeeded}
              tone="player"
              pulseWin={pulsePlayerWin}
            />
          </div>
          <span className="ga-live-vs">vs</span>
          <div className="ga-live-side ga-live-side--ai">
            <span className="ga-live-name">MARKOV</span>
            <ScoreDots
              wins={score.ai}
              needed={winsNeeded}
              tone="ai"
              pulseWin={pulseAiWin}
            />
          </div>
        </div>
      </div>

      {live.phase === "starting" && (
        <div className="ga-live-starting" aria-hidden>
          <span className="ga-live-starting-hand">{RPS_EMOJI[0]}</span>
          <span className="ga-live-starting-hand">{RPS_EMOJI[1]}</span>
          <span className="ga-live-starting-hand">{RPS_EMOJI[2]}</span>
        </div>
      )}

      {live.phase !== "starting" && (
        <div
          className={`ga-live-round${roundFlash ? " ga-live-round--enter" : ""}`}
          key={`${live.matchId}-${live.round ?? "f"}-${live.updatedAt}`}
        >
          <div className="ga-live-move ga-live-move--player">
            <span className="ga-live-move-label">{player}</span>
            <span className="ga-live-move-emoji" aria-hidden>
              {live.playerMove != null
                ? rpsEmoji(live.playerMove)
                : live.playerMoveLabel
                  ? rpsEmoji(
                      ["rock", "paper", "scissors"].indexOf(
                        live.playerMoveLabel.toLowerCase(),
                      ),
                    )
                  : "❔"}
            </span>
            <span className="ga-live-move-value">
              {live.playerMoveLabel ?? rpsMoveName(live.playerMove)}
            </span>
          </div>
          <div className="ga-live-round-mid">
            {live.phase === "playing" && live.result && (
              <span
                className={`ga-live-round-result ga-live-round-result--${live.result} ga-live-round-result--pop`}
              >
                {roundResultLabel(live.result)}
              </span>
            )}
            {live.phase === "ended" && live.final?.matchLine && (
              <p className="ga-live-markov">{live.final.matchLine}</p>
            )}
          </div>
          <div className="ga-live-move ga-live-move--ai">
            <span className="ga-live-move-label">MARKOV</span>
            <span className="ga-live-move-emoji" aria-hidden>
              {rpsEmoji(live.aiMove)}
            </span>
            <span className="ga-live-move-value">
              {rpsMoveName(live.aiMove)}
            </span>
          </div>
        </div>
      )}

      {live.markovLine && live.phase === "playing" && (
        <p className="ga-live-markov">&ldquo;{live.markovLine}&rdquo;</p>
      )}

      {readPct != null && live.phase === "playing" && (
        <div className="ga-live-read">
          <span className="muted">Read level</span>
          <div className="ga-live-read-bar" role="presentation">
            <div
              className="ga-live-read-fill"
              style={{ width: `${readPct}%` }}
            />
          </div>
          <span className="ga-live-read-pct">{readPct}%</span>
        </div>
      )}

      <p className="ga-live-meta muted">
        Match {live.matchId.slice(0, 8)}… · ties {score.ties}
        {live.final?.totalRounds != null
          ? ` · ${live.final.totalRounds} rounds`
          : ""}
      </p>
    </div>
  );
}

function feedBadgeClass(
  liveFeedState: LiveFeedState,
  sseStatus: string,
): string {
  if (liveFeedState === "waiting") return "connecting";
  if (liveFeedState === "replay") return "ended";
  if (sseStatus === "error") return "error";
  if (liveFeedState === "live" || sseStatus === "connected") return "connected";
  return sseStatus;
}

export function GameArenaLiveSection({
  liveDisplay,
  liveFeedState,
  sseMatchId,
  sseStatus,
  sseBadgeLabel,
  agentName,
  nextMatchIn,
  agentLive,
  title = "Live arena",
  idleMessage,
}: {
  liveDisplay: GameArenaLiveMatch | null;
  liveFeedState: LiveFeedState;
  sseMatchId: string | null;
  sseStatus: string;
  sseBadgeLabel: string | null;
  agentName?: string;
  nextMatchIn?: number | null;
  agentLive?: boolean;
  title?: string;
  idleMessage?: string;
}) {
  return (
    <section className="ga-live-section">
      <div className="ga-live-section-head">
        <h2>{title}</h2>
        {(sseMatchId || sseBadgeLabel) && (
          <span
            className={`ga-live-feed-badge ga-live-feed-badge--${feedBadgeClass(
              liveFeedState,
              sseStatus,
            )}`}
          >
            {sseBadgeLabel}
          </span>
        )}
      </div>
      {liveFeedState === "waiting" || liveFeedState === "connecting" ? (
        <GameArenaLiveWaiting
          agentName={agentName}
          nextMatchIn={nextMatchIn}
          feedState={
            liveFeedState === "connecting" ? "connecting" : "waiting"
          }
        />
      ) : liveDisplay &&
        (liveDisplay.phase === "starting" ||
          liveDisplay.phase === "playing" ||
          liveDisplay.phase === "ended") ? (
        <GameArenaLiveArena
          live={liveDisplay}
          agentName={agentName}
          feedState={liveFeedState}
        />
      ) : (
        <p className="ga-live-idle muted">
          {idleMessage ??
            "No match in progress. When your agent starts challenge-ai, this panel subscribes to GameArena's live SSE feed for round-by-round RPS vs MARKOV."}
          {agentLive && !sseMatchId
            ? " Waiting for the next match to start…"
            : ""}
        </p>
      )}
      {agentLive &&
        liveFeedState !== "waiting" &&
        liveFeedState !== "connecting" &&
        nextMatchIn != null && (
          <p className="ga-live-next muted">
            {nextMatchIn > 0
              ? `Next match in ~${nextMatchIn}s`
              : "Proposing next match…"}
          </p>
        )}
    </section>
  );
}
