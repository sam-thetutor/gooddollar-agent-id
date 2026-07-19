/** Skill entry flags from goodagent-skills/registry.json */
export interface RegistrySkillFlags {
  /**
   * When false, hide from marketplace + deploy picker.
   * Omitted or true = listed.
   */
  listed?: boolean;
  /**
   * When false, block new deploys (host + runtime pipeline).
   * Alias for hard-disable; `listed: false` implies the same.
   * Omitted or true = enabled.
   */
  enabled?: boolean;
}

export function isSkillListed(skill: RegistrySkillFlags): boolean {
  return skill.listed !== false && skill.enabled !== false;
}

export function isSkillDeployable(skill: RegistrySkillFlags): boolean {
  return isSkillListed(skill);
}

export function filterListedSkills<T extends RegistrySkillFlags & { skill_id: string }>(
  skills: T[],
): T[] {
  return skills.filter((s) => isSkillListed(s));
}

/** Prefer GameArena when listed; otherwise first listed skill. */
export function defaultDeploySkillId(
  skills: Array<RegistrySkillFlags & { skill_id: string }>,
): string {
  const listed = filterListedSkills(skills);
  const preferred = "gaming/wagering/gamearena_1v1";
  if (listed.some((s) => s.skill_id === preferred)) return preferred;
  return listed[0]?.skill_id ?? preferred;
}
