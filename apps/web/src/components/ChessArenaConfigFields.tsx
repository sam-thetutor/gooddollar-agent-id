import type { ReactNode } from "react";
import {
  CHESS_ARENA_PLAY_MODES,
  CHESS_ARENA_SOLVER_ENGINES,
  parseChessArenaPlayMode,
  parseChessArenaSolverEngine,
} from "../lib/chess-arena-config.js";
import type { SkillConfiguration } from "../lib/host.js";

function ConfigField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`config-field ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ChessArenaConfigFields({
  config,
  onChange,
  compact = false,
  variant = "default",
}: {
  config: SkillConfiguration;
  onChange: (key: string, value: string) => void;
  compact?: boolean;
  variant?: "default" | "onboard";
}) {
  const playMode = parseChessArenaPlayMode(config);
  const solver = parseChessArenaSolverEngine(config);
  const solverHint =
    CHESS_ARENA_SOLVER_ENGINES.find((e) => e.id === solver)?.hint ??
    "Puzzle engine used during the 30-second session.";

  const playModeSection = (
    <section className="config-section">
      <h4 className="config-section-title">Lobby mode</h4>
      <div className="chips">
        {CHESS_ARENA_PLAY_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`chip ${playMode === mode.id ? "chip-on" : ""}`}
            onClick={() => onChange("PLAY_MODE", mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {!compact && (
        <p className="config-section-note muted">
          {CHESS_ARENA_PLAY_MODES.find((m) => m.id === playMode)?.hint}
        </p>
      )}
    </section>
  );

  const solverSection = (
    <section className="config-section">
      <h4 className="config-section-title">Puzzle solver</h4>
      <div className="chips">
        {CHESS_ARENA_SOLVER_ENGINES.map((engine) => (
          <button
            key={engine.id}
            type="button"
            className={`chip ${solver === engine.id ? "chip-on" : ""}`}
            onClick={() => onChange("SOLVER_ENGINE", engine.id)}
          >
            {engine.label}
          </button>
        ))}
      </div>
      {solver === "stockfish" && (
        <ConfigField label="Engine think time per puzzle">
          <div className="input-suffix">
            <input
              value={config.SOLVER_MOVETIME_MS ?? "450"}
              onChange={(e) => onChange("SOLVER_MOVETIME_MS", e.target.value)}
              inputMode="numeric"
            />
            <span className="input-suffix-label">ms</span>
          </div>
        </ConfigField>
      )}
      {!compact && <p className="config-section-note muted">{solverHint}</p>}
    </section>
  );

  const fundingSection = (
    <section className="config-section">
      <h4 className="config-section-title">Funding</h4>
      <ConfigField label="Auto-swap G$ → USDT before matches">
        <select
          value={config.AUTO_SWAP ?? "1"}
          onChange={(e) => onChange("AUTO_SWAP", e.target.value)}
        >
          <option value="1">On — swap when USDT is low</option>
          <option value="0">Off — USDT must be pre-funded</option>
        </select>
      </ConfigField>
      {(config.AUTO_SWAP ?? "1") !== "0" && (
        <div className="config-row-2">
          <ConfigField label="USDT target before each match">
            <div className="input-suffix">
              <input
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
                inputMode="decimal"
              />
              <span className="input-suffix-label">USDT</span>
            </div>
          </ConfigField>
          <ConfigField label="G$ reserve after swap">
            <div className="input-suffix">
              <input
                value={config.MIN_GS_RESERVE ?? "50"}
                onChange={(e) => onChange("MIN_GS_RESERVE", e.target.value)}
                inputMode="numeric"
              />
              <span className="input-suffix-label">G$</span>
            </div>
          </ConfigField>
        </div>
      )}
    </section>
  );

  const limitsSection = (
    <section className="config-section">
      <h4 className="config-section-title">Run limits</h4>
      <div className="config-row-2">
        <ConfigField label="Daily match cap">
          <input
            value={config.DAILY_MATCH_CAP ?? "20"}
            onChange={(e) => onChange("DAILY_MATCH_CAP", e.target.value)}
            inputMode="numeric"
          />
        </ConfigField>
        <ConfigField label="Max matches per run">
          <input
            value={config.MAX_MATCHES ?? "5"}
            onChange={(e) => onChange("MAX_MATCHES", e.target.value)}
            inputMode="numeric"
          />
        </ConfigField>
      </div>
      <ConfigField label="Pause between matches">
        <div className="input-suffix">
          <input
            value={config.MATCH_INTERVAL_SECONDS ?? "120"}
            onChange={(e) => onChange("MATCH_INTERVAL_SECONDS", e.target.value)}
            inputMode="numeric"
          />
          <span className="input-suffix-label">sec</span>
        </div>
      </ConfigField>
    </section>
  );

  const advancedSections = (
    <>
      {fundingSection}
      {limitsSection}
    </>
  );

  return (
    <div
      className={`chess-arena-config-form${variant === "onboard" ? " chess-arena-config-form--onboard" : ""}`}
    >
      {solverSection}
      {playModeSection}
      {compact ? (
        <details className="deploy-advanced-details">
          <summary>Funding & limits</summary>
          <div className="deploy-advanced-details-body">{advancedSections}</div>
        </details>
      ) : (
        advancedSections
      )}
    </div>
  );
}
