import type { SkillConfiguration } from "../types.js";
import {
  ACTIONORDER_SKILL_ID,
  BALAIO_WORKER_SKILL_ID,
  GAMEARENA_SKILL_ID,
  PLAYCHESSIFY_SKILL_ID,
  UBI_REMINDER_SKILL_ID,
} from "../skill-config.js";

const ACTIONORDER_CHARACTERS = [
  { id: "riven", label: "Riven" },
  { id: "mira", label: "Mira" },
  { id: "kade", label: "Kade" },
] as const;

const ACTIONORDER_STRATEGIES = [
  { id: "anti_strike", label: "Anti-strike" },
  { id: "rush", label: "Rush" },
  { id: "balanced", label: "Balanced" },
] as const;

const PLAYCHESSIFY_PRESETS = [
  { id: "beginner", label: "Beginner" },
  { id: "balanced", label: "Balanced" },
  { id: "aggressive", label: "Aggressive" },
  { id: "positional", label: "Positional" },
  { id: "tactical", label: "Tactical" },
  { id: "endgame_grind", label: "Endgame grind" },
] as const;

export function SkillConfigFields({
  skillId,
  config,
  onChange,
  telegramBotToken,
  onTelegramBotTokenChange,
  compact = false,
}: {
  skillId: string;
  config: SkillConfiguration;
  onChange: (key: string, value: string) => void;
  telegramBotToken?: string;
  onTelegramBotTokenChange?: (value: string) => void;
  compact?: boolean;
}) {
  const gridClass = compact ? " ga-widget-config-grid" : "";
  const fieldClass = compact ? "ga-widget-field" : "ga-widget-field";
  const inputClass = compact ? "ga-widget-input ga-widget-input-compact" : "ga-widget-input";
  const selectClass = compact ? "ga-widget-select ga-widget-input-compact" : "ga-widget-input";

  if (skillId === GAMEARENA_SKILL_ID) {
    return (
      <div className={`ga-widget-config-fields${gridClass}`}>
        <label className={fieldClass}>
          <span>Strategy</span>
          <select
            className={selectClass}
            value={config.MARKOV_STRATEGY ?? "random"}
            onChange={(e) => onChange("MARKOV_STRATEGY", e.target.value)}
          >
            <option value="random">Random</option>
            <option value="sequence">Sequence</option>
            <option value="fixed">Fixed</option>
            <option value="counter">Counter last</option>
          </select>
        </label>
        <label className={fieldClass}>
          <span>Play mode</span>
          <select
            className={selectClass}
            value={config.PLAY_MODE ?? "offchain"}
            onChange={(e) => onChange("PLAY_MODE", e.target.value)}
          >
            <option value="offchain">Free tickets</option>
            <option value="onchain">On-chain G$</option>
            <option value="auto">Auto</option>
          </select>
        </label>
        <label className={fieldClass}>
          <span>Daily cap</span>
          <input
            className={inputClass}
            type="number"
            min={1}
            value={config.DAILY_MATCH_CAP ?? "50"}
            onChange={(e) => onChange("DAILY_MATCH_CAP", e.target.value)}
          />
        </label>
        <label className={fieldClass}>
          <span>Max / run</span>
          <input
            className={inputClass}
            type="number"
            min={1}
            value={config.MAX_MATCHES ?? "10"}
            onChange={(e) => onChange("MAX_MATCHES", e.target.value)}
          />
        </label>
        <label className={`${fieldClass} ga-widget-config-grid-span2`}>
          <span>Pause (sec)</span>
          <input
            className={inputClass}
            type="number"
            min={1}
            value={config.MATCH_INTERVAL_SECONDS ?? "300"}
            onChange={(e) => onChange("MATCH_INTERVAL_SECONDS", e.target.value)}
          />
        </label>
      </div>
    );
  }

  if (skillId === ACTIONORDER_SKILL_ID) {
    return (
      <>
        <label className="ga-widget-field">
          <span>Character</span>
          <select
            className="ga-widget-input"
            value={config.CHARACTER_ID ?? "riven"}
            onChange={(e) => onChange("CHARACTER_ID", e.target.value)}
          >
            {ACTIONORDER_CHARACTERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ga-widget-field">
          <span>Strategy</span>
          <select
            className="ga-widget-input"
            value={config.STRATEGY ?? "anti_strike"}
            onChange={(e) => onChange("STRATEGY", e.target.value)}
          >
            {ACTIONORDER_STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ga-widget-field">
          <span>House difficulty</span>
          <select
            className="ga-widget-input"
            value={config.DIFFICULTY ?? "0"}
            onChange={(e) => onChange("DIFFICULTY", e.target.value)}
          >
            <option value="0">Easy</option>
            <option value="1">Normal</option>
            <option value="2">Hard</option>
            <option value="3">Expert</option>
          </select>
        </label>
        <label className="ga-widget-field">
          <span>Max matches per day</span>
          <input
            className="ga-widget-input"
            type="number"
            min={1}
            value={config.MAX_MATCHES ?? "5"}
            onChange={(e) => onChange("MAX_MATCHES", e.target.value)}
          />
        </label>
      </>
    );
  }

  if (skillId === PLAYCHESSIFY_SKILL_ID) {
    return (
      <>
        <label className="ga-widget-field">
          <span>Play mode</span>
          <select
            className="ga-widget-input"
            value={config.PLAY_MODE ?? "bot"}
            onChange={(e) => onChange("PLAY_MODE", e.target.value)}
          >
            <option value="bot">Join bot lobbies</option>
            <option value="host">Host a room</option>
            <option value="join">Join open lobby</option>
          </select>
        </label>
        <label className="ga-widget-field">
          <span>Strategy preset</span>
          <select
            className="ga-widget-input"
            value={config.STRATEGY_PRESET ?? "balanced"}
            onChange={(e) => onChange("STRATEGY_PRESET", e.target.value)}
          >
            {PLAYCHESSIFY_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ga-widget-field">
          <span>Max wager (CHESS)</span>
          <input
            className="ga-widget-input"
            type="number"
            min={1}
            value={config.MAX_WAGER ?? "100"}
            onChange={(e) => onChange("MAX_WAGER", e.target.value)}
          />
        </label>
        {(config.PLAY_MODE ?? "bot") === "host" && (
          <label className="ga-widget-field">
            <span>Host wager (CHESS)</span>
            <input
              className="ga-widget-input"
              type="number"
              min={1}
              value={config.HOST_WAGER ?? config.MAX_WAGER ?? "100"}
              onChange={(e) => onChange("HOST_WAGER", e.target.value)}
            />
          </label>
        )}
        {(config.PLAY_MODE ?? "bot") === "join" && (
          <label className="ga-widget-field">
            <span>Join game ID (optional)</span>
            <input
              className="ga-widget-input"
              type="number"
              min={1}
              placeholder="From hosting agent logs"
              value={config.JOIN_GAME_ID ?? ""}
              onChange={(e) => onChange("JOIN_GAME_ID", e.target.value)}
            />
          </label>
        )}
        {(config.PLAY_MODE ?? "bot") === "bot" && (
          <>
            <label className="ga-widget-field">
              <span>Bot Elo min</span>
              <input
                className="ga-widget-input"
                type="number"
                min={600}
                value={config.TARGET_BOT_MIN_ELO ?? "600"}
                onChange={(e) => onChange("TARGET_BOT_MIN_ELO", e.target.value)}
              />
            </label>
            <label className="ga-widget-field">
              <span>Bot Elo max</span>
              <input
                className="ga-widget-input"
                type="number"
                min={600}
                value={config.TARGET_BOT_MAX_ELO ?? "1200"}
                onChange={(e) => onChange("TARGET_BOT_MAX_ELO", e.target.value)}
              />
            </label>
          </>
        )}
        <label className="ga-widget-field">
          <span>Max matches / run</span>
          <input
            className="ga-widget-input"
            type="number"
            min={1}
            value={config.MAX_MATCHES ?? "3"}
            onChange={(e) => onChange("MAX_MATCHES", e.target.value)}
          />
        </label>
      </>
    );
  }

  if (skillId === UBI_REMINDER_SKILL_ID) {
    return (
      <>
        <label className="ga-widget-field">
          <span>Telegram bot token</span>
          <input
            className="ga-widget-input"
            type="password"
            value={telegramBotToken ?? ""}
            onChange={(e) => onTelegramBotTokenChange?.(e.target.value)}
            placeholder="From @BotFather"
            autoComplete="off"
          />
        </label>
        <label className="ga-widget-field">
          <span>Scan interval (minutes)</span>
          <input
            className="ga-widget-input"
            type="number"
            min={1}
            value={config.REMINDER_INTERVAL_MINUTES ?? "15"}
            onChange={(e) =>
              onChange("REMINDER_INTERVAL_MINUTES", e.target.value)
            }
          />
        </label>
      </>
    );
  }

  if (skillId === BALAIO_WORKER_SKILL_ID) {
    return (
      <>
        <label className="ga-widget-field">
          <span>Worker mode</span>
          <select
            className="ga-widget-input"
            value={config.ENABLE_WORKER ?? "1"}
            onChange={(e) => onChange("ENABLE_WORKER", e.target.value)}
          >
            <option value="1">Scan & complete tasks</option>
            <option value="0">Off</option>
          </select>
        </label>
        <label className="ga-widget-field">
          <span>Scan interval (seconds)</span>
          <input
            className="ga-widget-input"
            type="number"
            min={60}
            value={config.SCAN_INTERVAL_SECONDS ?? "300"}
            onChange={(e) => onChange("SCAN_INTERVAL_SECONDS", e.target.value)}
          />
        </label>
        <label className="ga-widget-field">
          <span>Min reward (G$)</span>
          <input
            className="ga-widget-input"
            type="number"
            min={0}
            value={config.MIN_REWARD ?? "1"}
            onChange={(e) => onChange("MIN_REWARD", e.target.value)}
          />
        </label>
      </>
    );
  }

  const keys = Object.keys(config);
  if (keys.length === 0) {
    return (
      <p className="ga-widget-muted">
        No skill settings exposed. Pass <code>skillConfiguration</code> in config
        or use <code>renderSkillConfig</code> for a custom form.
      </p>
    );
  }

  return (
    <div className="ga-widget-stack">
      {keys.map((key) => (
        <label key={key} className="ga-widget-field">
          <span>{key.replace(/_/g, " ")}</span>
          <input
            className="ga-widget-input"
            value={config[key] ?? ""}
            onChange={(e) => onChange(key, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
