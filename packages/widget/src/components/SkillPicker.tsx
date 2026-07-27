import type { RegistrySkillEntry } from "../skill-registry.js";

export function SkillPicker({
  skills,
  selectedSkillId,
  onSelect,
  disabled,
}: {
  skills: RegistrySkillEntry[];
  selectedSkillId: string;
  onSelect: (skillId: string) => void;
  disabled?: boolean;
}) {
  if (skills.length <= 1) return null;

  return (
    <div className="ga-widget-skill-picker">
      <p className="ga-widget-muted ga-widget-skill-picker-lead">
        Choose a skill from the GoodAgent registry. Your wallet will own the
        deploy; GoodAgent hosts and runs the bot.
      </p>
      <div className="ga-widget-skill-grid" role="listbox" aria-label="Skills">
        {skills.map((skill) => {
          const selected = skill.skill_id === selectedSkillId;
          return (
            <button
              key={skill.skill_id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              className={`ga-widget-skill-card${selected ? " ga-widget-skill-card-selected" : ""}`}
              onClick={() => onSelect(skill.skill_id)}
            >
              <span className="ga-widget-skill-card-name">{skill.name}</span>
              <span className="ga-widget-skill-card-id">
                {skill.skill_id.split("/").pop()}
              </span>
              <span className="ga-widget-skill-card-desc">
                {skill.description}
              </span>
              {skill.game && skill.game_url ? (
                <span className="ga-widget-skill-card-game">{skill.game}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
