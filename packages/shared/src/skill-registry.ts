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

/** Registry v2 optional runtime block for plugin-based skills. */
export interface RegistrySkillRuntime {
  /** Plugin entry relative to skill package root (default dist/plugin.js) */
  entry?: string;
  /** Skill SDK API version (default 1) */
  apiVersion?: 1;
}

export interface RegistrySkillCapabilities {
  spendsTokens?: boolean;
  requiresTelegram?: boolean;
  requiresPrivateKey?: boolean;
}

export interface RegistrySkillCompatibility {
  minRuntimeVersion?: string;
  chains?: string[];
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

/** Skills hidden from the deploy wizard picker (still supported for existing deploys). */
export const DEPLOY_PICKER_EXCLUDED_SKILL_IDS = new Set([
  "work/marketplace/balaio_worker",
  "gaming/wagering/playchessify_1v1",
  "gaming/intelligence/proof_of_alpha_hunt",
]);

export function filterDeployPickerSkills<
  T extends RegistrySkillFlags & { skill_id: string },
>(skills: T[]): T[] {
  return filterListedSkills(skills).filter(
    (s) => !DEPLOY_PICKER_EXCLUDED_SKILL_IDS.has(s.skill_id),
  );
}

/** Prefer GameArena when listed; otherwise first deploy-picker skill. */
export function defaultDeploySkillId(
  skills: Array<RegistrySkillFlags & { skill_id: string }>,
): string {
  const listed = filterDeployPickerSkills(skills);
  const preferred = "gaming/wagering/gamearena_1v1";
  if (listed.some((s) => s.skill_id === preferred)) return preferred;
  const chessArena = "gaming/wagering/chess_arena_1v1";
  if (listed.some((s) => s.skill_id === chessArena)) return chessArena;
  return listed[0]?.skill_id ?? preferred;
}
