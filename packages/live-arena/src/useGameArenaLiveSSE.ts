import { useEffect, useRef, useState } from "react";
import type { GameArenaLiveMatch } from "./live.js";
import {
  gameArenaLiveSseUrl,
  mapGameArenaSseEvent,
  parseGameArenaSsePayload,
  type GameArenaSseEvent,
} from "./sse.js";

export type GameArenaSseStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "ended"
  | "error";

export function useGameArenaLiveSSE(
  matchId: string | null | undefined,
  playerLabel?: string,
  hostBaseUrl?: string,
): {
  live: GameArenaLiveMatch | null;
  status: GameArenaSseStatus;
  error: string | null;
} {
  const [live, setLive] = useState<GameArenaLiveMatch | null>(null);
  const [status, setStatus] = useState<GameArenaSseStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    endedRef.current = false;
    setLive(null);
    setError(null);

    if (!matchId?.trim()) {
      setStatus("idle");
      return;
    }

    const id = matchId.trim();
    setStatus("connecting");

    const es = new EventSource(gameArenaLiveSseUrl(id, hostBaseUrl));
    const connectTimeout = window.setTimeout(() => {
      if (endedRef.current || es.readyState === EventSource.OPEN) return;
      es.close();
      setStatus("error");
      setError("GameArena live feed timed out — showing host snapshot");
    }, 5_000);

    const apply = (event: GameArenaSseEvent) => {
      const snap = mapGameArenaSseEvent(event, id, playerLabel);
      setLive(snap);
      if (event.type === "hello") {
        window.clearTimeout(connectTimeout);
        setStatus("connected");
        setError(null);
      } else if (event.type === "round") {
        window.clearTimeout(connectTimeout);
        setStatus("connected");
      } else if (event.type === "end") {
        endedRef.current = true;
        setStatus("ended");
        es.close();
      }
    };

    const onPayload = (raw: string) => {
      const parsed = parseGameArenaSsePayload(raw);
      if (parsed) apply(parsed);
    };

    es.onmessage = (e) => onPayload(e.data);

    for (const name of ["hello", "round", "end"] as const) {
      es.addEventListener(name, (e) => {
        const msg = e as MessageEvent<string>;
        onPayload(msg.data);
      });
    }

    es.onerror = () => {
      if (endedRef.current) return;
      if (es.readyState === EventSource.CONNECTING) {
        setStatus("connecting");
        return;
      }
      if (es.readyState === EventSource.CLOSED && endedRef.current) return;
      setStatus("error");
      setError("GameArena live feed disconnected");
    };

    es.onopen = () => {
      window.clearTimeout(connectTimeout);
      if (!endedRef.current) setStatus("connected");
    };

    return () => {
      window.clearTimeout(connectTimeout);
      es.close();
    };
  }, [matchId, playerLabel, hostBaseUrl]);

  return { live, status, error };
}
