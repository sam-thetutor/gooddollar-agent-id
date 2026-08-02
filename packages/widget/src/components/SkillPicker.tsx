import type { RegistrySkillEntry } from "../skill-registry.js";

export function SkillPicker({
  skills,
  selectedSkillIds,
  activeSkillId,
  onToggle,
  onFocus,
  maxSkills = 3,
  disabled,
}: {
  skills: RegistrySkillEntry[];
  selectedSkillIds: string[];
  activeSkillId: string;
  onToggle: (skillId: string) => void;
  onFocus?: (skillId: string) => void;
  maxSkills?: number;
  disabled?: boolean;
}) {
  if (skills.length <= 1) return null;

  return (
    <div className="ga-widget-skill-picker">
      <p className="ga-widget-muted ga-widget-skill-picker-lead">
        Choose up to {maxSkills} skills. One wallet runs them together on
        GoodAgent.
      </p>
      <div className="ga-widget-skill-grid" role="listbox" aria-label="Skills">
        {skills.map((skill) => {
          const selected = selectedSkillIds.includes(skill.skill_id);
          const active = skill.skill_id === activeSkillId;
          return (
            <button
              key={skill.skill_id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={
                disabled ||
                (!selected && selectedSkillIds.length >= maxSkills)
              }
              className={`ga-widget-skill-card${selected ? " ga-widget-skill-card-selected" : ""}${active ? " ga-widget-skill-card-active" : ""}`}
              onClick={() => {
                if (selected && selectedSkillIds.length === 1) {
                  onFocus?.(skill.skill_id);
                  return;
                }
                onToggle(skill.skill_id);
                onFocus?.(skill.skill_id);
              }}
            >
              <span className="ga-widget-skill-card-check" aria-hidden>
                {selected ? "✓" : ""}
              </span>
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
