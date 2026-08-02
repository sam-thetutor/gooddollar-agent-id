import { lazy, Suspense } from "react";
import type { GameArenaLiveBlockProps } from "./GameArenaLiveBlockInner.js";

const GameArenaLiveBlockInner = lazy(() =>
  import("./GameArenaLiveBlockInner.js").then((m) => ({
    default: m.GameArenaLiveBlockInner,
  })),
);

export function GameArenaLiveBlock(props: GameArenaLiveBlockProps) {
  return (
    <Suspense fallback={null}>
      <GameArenaLiveBlockInner {...props} />
    </Suspense>
  );
}
