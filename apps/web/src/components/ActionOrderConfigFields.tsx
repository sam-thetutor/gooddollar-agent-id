import type { SkillConfiguration } from "../lib/host.js";

const CHARACTERS = [
  { id: "riven", label: "Riven" },
  { id: "mira", label: "Mira" },
  { id: "kade", label: "Kade" },
] as const;

const STRATEGIES = [
  { id: "anti_strike", label: "Anti-strike" },
  { id: "rush", label: "Rush" },
  { id: "balanced", label: "Balanced" },
] as const;

export function ActionOrderConfigFields({
  config,
  onChange,
}: {
  config: SkillConfiguration;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="deploy-config-grid">
      <label className="field">
        <span>Character</span>
        <select
          value={config.CHARACTER_ID ?? "riven"}
          onChange={(e) => onChange("CHARACTER_ID", e.target.value)}
        >
          {CHARACTERS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Strategy</span>
        <select
          value={config.STRATEGY ?? "anti_strike"}
          onChange={(e) => onChange("STRATEGY", e.target.value)}
        >
          {STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>House difficulty</span>
        <select
          value={config.DIFFICULTY ?? "0"}
          onChange={(e) => onChange("DIFFICULTY", e.target.value)}
        >
          <option value="0">Easy</option>
          <option value="1">Normal</option>
          <option value="2">Hard</option>
          <option value="3">Expert</option>
        </select>
      </label>

      <label className="field">
        <span>Max matches per day</span>
        <input
          value={config.MAX_MATCHES ?? "5"}
          onChange={(e) => onChange("MAX_MATCHES", e.target.value)}
          inputMode="numeric"
        />
      </label>

      <label className="field">
        <span>Pause between matches</span>
        <div className="input-suffix">
          <input
            value={config.MATCH_INTERVAL_SECONDS ?? "10"}
            onChange={(e) => onChange("MATCH_INTERVAL_SECONDS", e.target.value)}
            inputMode="numeric"
          />
          <span className="input-suffix-label">sec</span>
        </div>
      </label>
    </div>
  );
}
