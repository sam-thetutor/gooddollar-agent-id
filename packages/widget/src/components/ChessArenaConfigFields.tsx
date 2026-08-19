import {
  CHESS_ARENA_PLAY_MODES,
  CHESS_ARENA_SOLVER_ENGINES,
  parseChessArenaPlayMode,
  parseChessArenaSolverEngine,
} from "../chess-arena-config.js";
import type { SkillConfiguration } from "../types.js";

export function ChessArenaConfigFields({
  config,
  onChange,
  compact = false,
}: {
  config: SkillConfiguration;
  onChange: (key: string, value: string) => void;
  compact?: boolean;
}) {
  const playMode = parseChessArenaPlayMode(config);
  const solver = parseChessArenaSolverEngine(config);
  const gridClass = compact ? " ga-widget-config-grid" : "";
  const fieldClass = "ga-widget-field";
  const inputClass = compact ? "ga-widget-input ga-widget-input-compact" : "ga-widget-input";
  const selectClass = compact ? "ga-widget-select ga-widget-input-compact" : "ga-widget-input";
  const playHint =
    CHESS_ARENA_PLAY_MODES.find((m) => m.id === playMode)?.hint ?? "";
  const solverHint =
    CHESS_ARENA_SOLVER_ENGINES.find((e) => e.id === solver)?.hint ?? "";

  return (
    <div className={`ga-widget-config-fields${gridClass}`}>
      <label className={fieldClass}>
        <span>Lobby mode</span>
        <select
          className={selectClass}
          value={playMode}
          onChange={(e) => onChange("PLAY_MODE", e.target.value)}
        >
          {CHESS_ARENA_PLAY_MODES.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.label}
            </option>
          ))}
        </select>
        {!compact && playHint ? (
          <span className="ga-widget-field-hint">{playHint}</span>
        ) : null}
      </label>

      <label className={fieldClass}>
        <span>Puzzle solver</span>
        <select
          className={selectClass}
          value={solver}
          onChange={(e) => onChange("SOLVER_ENGINE", e.target.value)}
        >
          {CHESS_ARENA_SOLVER_ENGINES.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.label}
            </option>
          ))}
        </select>
        {!compact && solverHint ? (
          <span className="ga-widget-field-hint">{solverHint}</span>
        ) : null}
      </label>

      {solver === "stockfish" ? (
        <label className={fieldClass}>
          <span>Think time (ms)</span>
          <input
            className={inputClass}
            type="number"
            min={100}
            max={3000}
            value={config.SOLVER_MOVETIME_MS ?? "450"}
            onChange={(e) => onChange("SOLVER_MOVETIME_MS", e.target.value)}
          />
        </label>
      ) : null}

      <label className={fieldClass}>
        <span>Auto-swap G$ → USDT</span>
        <select
          className={selectClass}
          value={config.AUTO_SWAP ?? "1"}
          onChange={(e) => onChange("AUTO_SWAP", e.target.value)}
        >
          <option value="1">On — swap when USDT is low</option>
          <option value="0">Off — pre-fund USDT manually</option>
        </select>
      </label>

      {(config.AUTO_SWAP ?? "1") !== "0" ? (
        <>
          <label className={fieldClass}>
            <span>USDT target per match</span>
            <input
              className={inputClass}
              type="number"
              min={1}
              step={0.1}
              value={
                config.USDT_STAKE_BUFFER
                  ? String(Number(config.USDT_STAKE_BUFFER) / 1_000_000)
                  : "1"
              }
              onChange={(e) => {
                const usdt = Number(e.target.value);
                onChange(
                  "USDT_STAKE_BUFFER",
                  Number.isFinite(usdt) && usdt > 0
                    ? String(Math.round(usdt * 1_000_000))
                    : "1000000",
                );
              }}
            />
          </label>
          <label className={fieldClass}>
            <span>G$ reserve after swap</span>
            <input
              className={inputClass}
              type="number"
              min={0}
              value={config.MIN_GS_RESERVE ?? "50"}
              onChange={(e) => onChange("MIN_GS_RESERVE", e.target.value)}
            />
          </label>
        </>
      ) : null}

      <label className={fieldClass}>
        <span>Daily cap</span>
        <input
          className={inputClass}
          type="number"
          min={0}
          value={config.DAILY_MATCH_CAP ?? "20"}
          onChange={(e) => onChange("DAILY_MATCH_CAP", e.target.value)}
        />
      </label>
      <label className={fieldClass}>
        <span>Max / run</span>
        <input
          className={inputClass}
          type="number"
          min={0}
          value={config.MAX_MATCHES ?? "5"}
          onChange={(e) => onChange("MAX_MATCHES", e.target.value)}
        />
      </label>
      <label className={`${fieldClass} ga-widget-config-grid-span2`}>
        <span>Pause (sec)</span>
        <input
          className={inputClass}
          type="number"
          min={10}
          value={config.MATCH_INTERVAL_SECONDS ?? "120"}
          onChange={(e) => onChange("MATCH_INTERVAL_SECONDS", e.target.value)}
        />
      </label>
    </div>
  );
}
