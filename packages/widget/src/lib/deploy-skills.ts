import type { DeployAgent, DeployStatusResponse } from "../client/host.js";
import {
  MAX_DEPLOY_SKILLS,
  configurableSkillsFromStatus,
  configForSkill,
  dashboardPanelForSkillId,
  deployKindLabel,
  formatSkillList,
  hasBalaioInStatus,
  hasGamearenaInStatus,
  isActionOrderSkillId,
  isPlaychessifySkillId,
  isBalaioSkillId,
  isGamearenaSkillId,
  isSkillEnabled,
  skillInstallStatusLabel,
  skillShortLabel,
  skillsFromStatus,
} from "@goodagent/shared";

export {
  MAX_DEPLOY_SKILLS,
  configurableSkillsFromStatus,
  configForSkill,
  dashboardPanelForSkillId,
  deployKindLabel,
  formatSkillList,
  hasBalaioInStatus,
  hasGamearenaInStatus,
  isActionOrderSkillId,
  isPlaychessifySkillId,
  isBalaioSkillId,
  isGamearenaSkillId,
  isSkillEnabled,
  skillInstallStatusLabel,
  skillShortLabel,
  skillsFromStatus,
};

export type { DeploySkillView } from "@goodagent/shared";

/** Alias for dashboard settings tabs. */
export const configurableSkills = configurableSkillsFromStatus;

export function hasGamearenaSkill(
  status: Pick<DeployStatusResponse, "skills" | "skillId">,
): boolean {
  return hasGamearenaInStatus(status);
}

export function hasConfigurableSkill(
  status: Pick<DeployStatusResponse, "skills" | "skillId">,
): boolean {
  return configurableSkillsFromStatus(status).length > 0;
}

export function skillsFromAgent(agent: DeployAgent) {
  if (!agent.skills?.length) return [];
  return agent.skills.map((s) => ({
    skillId: s.skillId,
    registryPath: s.registryPath ?? "",
    status: s.status ?? "installed",
    configuration: {},
  }));
}
