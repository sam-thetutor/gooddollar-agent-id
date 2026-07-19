export {
  defaultDeploySkillId,
  filterListedSkills,
  isSkillListed,
  type RegistrySkillFlags,
} from "@goodagent/shared";

import { defaultDeploySkillId } from "@goodagent/shared";

/** Fallback when registry has not loaded yet. */
export const DEFAULT_DEPLOY_SKILL_ID = "gaming/wagering/gamearena_1v1";

export function resolveDefaultDeploySkillId(
  skills: Array<{ skill_id: string; listed?: boolean; enabled?: boolean }>,
): string {
  if (skills.length === 0) return DEFAULT_DEPLOY_SKILL_ID;
  return defaultDeploySkillId(skills);
}
