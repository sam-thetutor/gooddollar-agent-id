import type { ReactNode } from "react";
import {
  MARKOV_STRATEGIES,
  type MarkovStrategyId,
} from "../lib/gamearena-config.js";
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

export function GamearenaConfigFields({
  config,
  onChange,
}: {
  config: SkillConfiguration;
  onChange: (key: string, value: string) => void;
}) {
  const playMode = config.PLAY_MODE ?? "offchain";
  const strategy = config.MARKOV_STRATEGY ?? "random";
  const showOnchain = playMode === "onchain" || playMode === "auto";
  const showOffchain = playMode === "offchain" || playMode === "auto";
  const strategyHint =
    MARKOV_STRATEGIES.find((s) => s.id === strategy)?.hint ??
    "Strategy applies to every throw vs MARKOV.";

  return (
    <div className="gamearena-config-form">
      <section className="config-section">
        <h4 className="config-section-title">Play mode</h4>
        <div className="chips">
          <button
            type="button"
            className={`chip ${playMode === "offchain" ? "chip-on" : ""}`}
            onClick={() => onChange("PLAY_MODE", "offchain")}
          >
            Free tickets
          </button>
          <button
            type="button"
            className={`chip ${playMode === "onchain" ? "chip-on" : ""}`}
            onClick={() => onChange("PLAY_MODE", "onchain")}
          >
            On-chain G$
          </button>
          <button
            type="button"
            className={`chip ${playMode === "auto" ? "chip-on" : ""}`}
            onClick={() => onChange("PLAY_MODE", "auto")}
          >
            Auto
          </button>
        </div>
        <p className="config-section-note muted">
          {playMode === "offchain" &&
            "Uses GameArena free tickets — works even when MARKOV’s keeper is offline."}
          {playMode === "onchain" &&
            "Escrows G$ wagers on-chain — requires MARKOV’s keeper to accept."}
          {playMode === "auto" &&
            "Plays off-chain first; switches to on-chain when MARKOV is live."}
        </p>
      </section>

      <section className="config-section">
        <h4 className="config-section-title">Strategy vs MARKOV</h4>
        <div className="config-row-2">
          <ConfigField label="Throw style">
            <select
              value={strategy}
              onChange={(e) => onChange("MARKOV_STRATEGY", e.target.value)}
            >
              {MARKOV_STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </ConfigField>

          {strategy === "fixed" ? (
            <ConfigField label="Fixed move">
              <select
                value={config.RPS_FIXED ?? "rock"}
                onChange={(e) => onChange("RPS_FIXED", e.target.value)}
              >
                <option value="rock">Rock</option>
                <option value="paper">Paper</option>
                <option value="scissors">Scissors</option>
              </select>
            </ConfigField>
          ) : strategy === "sequence" ? (
            <ConfigField label="Sequence">
              <input
                value={config.RPS_SEQUENCE ?? "rock,paper,scissors"}
                onChange={(e) => onChange("RPS_SEQUENCE", e.target.value)}
                placeholder="rock,paper,scissors"
              />
            </ConfigField>
          ) : (
            <div className="config-field config-field-spacer" aria-hidden />
          )}
        </div>
        {strategy !== "random" && (
          <p className="config-section-note muted">{strategyHint}</p>
        )}
      </section>

      {showOffchain && (
        <section className="config-section">
          <h4 className="config-section-title">Free tickets & refills</h4>
          <ConfigField label="Auto-buy refills when free tickets run out">
            <select
              value={config.AUTO_REFILL ?? "1"}
              onChange={(e) => onChange("AUTO_REFILL", e.target.value)}
            >
              <option value="1">On — pay G$ for more tickets</option>
              <option value="0">Off — stop when free tickets are used</option>
            </select>
          </ConfigField>
          {(config.AUTO_REFILL ?? "1") !== "0" && (
            <div className="config-row-2">
              <ConfigField label="Refill budget per day">
                <div className="input-suffix">
                  <input
                    value={config.DAILY_REFILL_CAP_GS ?? "20"}
                    onChange={(e) =>
                      onChange("DAILY_REFILL_CAP_GS", e.target.value)
                    }
                    inputMode="numeric"
                  />
                  <span className="input-suffix-label">G$</span>
                </div>
              </ConfigField>
              <ConfigField label="Max refills per day">
                <input
                  value={config.MAX_REFILLS_PER_DAY ?? "10"}
                  onChange={(e) =>
                    onChange("MAX_REFILLS_PER_DAY", e.target.value)
                  }
                  inputMode="numeric"
                />
              </ConfigField>
            </div>
          )}
          <p className="config-section-note muted">
            GameArena gives free Challenge AI tickets daily; when they run out,
            auto-refill sends G$ on-chain (typically 2 G$ → +5 tickets) so the
            agent keeps playing until daily match cap.
          </p>
        </section>
      )}

      <section className="config-section">
        <h4 className="config-section-title">Run limits</h4>
        <div className="config-row-2">
          {showOffchain && (
            <ConfigField label="Daily match cap">
              <input
                value={config.DAILY_MATCH_CAP ?? "50"}
                onChange={(e) => onChange("DAILY_MATCH_CAP", e.target.value)}
                inputMode="numeric"
              />
            </ConfigField>
          )}
          <ConfigField label="Max matches per run">
            <input
              value={config.MAX_MATCHES ?? "10"}
              onChange={(e) => onChange("MAX_MATCHES", e.target.value)}
              inputMode="numeric"
            />
          </ConfigField>
          {!showOffchain && <div className="config-field-spacer" aria-hidden />}
        </div>
        <ConfigField label="Pause between matches">
          <div className="input-suffix">
            <input
              value={config.MATCH_INTERVAL_SECONDS ?? "300"}
              onChange={(e) =>
                onChange("MATCH_INTERVAL_SECONDS", e.target.value)
              }
              inputMode="numeric"
            />
            <span className="input-suffix-label">sec</span>
          </div>
        </ConfigField>
      </section>

      {showOnchain && (
        <section className="config-section">
          <h4 className="config-section-title">On-chain wagers</h4>
          <div className="config-row-2">
            <ConfigField label="Wager per match">
              <div className="input-suffix">
                <input
                  value={config.WAGER_GS ?? "1"}
                  onChange={(e) => onChange("WAGER_GS", e.target.value)}
                  inputMode="numeric"
                />
                <span className="input-suffix-label">G$</span>
              </div>
            </ConfigField>
            <ConfigField label="Daily loss cap">
              <div className="input-suffix">
                <input
                  value={config.DAILY_LOSS_CAP_GS ?? "20"}
                  onChange={(e) =>
                    onChange("DAILY_LOSS_CAP_GS", e.target.value)
                  }
                  inputMode="numeric"
                />
                <span className="input-suffix-label">G$</span>
              </div>
            </ConfigField>
          </div>
          <ConfigField label="MARKOV accept timeout">
            <div className="input-suffix">
              <input
                value={config.ACCEPT_TIMEOUT_SECONDS ?? "90"}
                onChange={(e) =>
                  onChange("ACCEPT_TIMEOUT_SECONDS", e.target.value)
                }
                inputMode="numeric"
              />
              <span className="input-suffix-label">sec</span>
            </div>
          </ConfigField>
        </section>
      )}
    </div>
  );
}

export type { MarkovStrategyId };
