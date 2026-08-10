/** Maximum skills per deploy (product cap). */
export const MAX_DEPLOY_SKILLS = 3;

export type DashboardPanelKind =
  | "gamearena"
  | "actionorder"
  | "balaio"
  | "ubi"
  | "generic";

export interface DeploySkillView {
  skillId: string;
  registryPath: string;
  status: string;
  configuration: Record<string, string>;
  lastError?: string | null;
}

export interface DeploySkillsStatusSource {
  skills?: DeploySkillView[];
  skillId?: string | null;
  configuration?: string | null;
}

export function isGamearenaSkillId(skillId: string): boolean {
  return skillId.includes("gamearena");
}

export function isBalaioSkillId(skillId: string): boolean {
  return skillId.includes("balaio");
}

export function isActionOrderSkillId(skillId: string): boolean {
  return skillId.includes("actionorder");
}

/** GameArena challenge-ai match ids from the arena backend. */
export function isGamearenaMatchId(matchId: string): boolean {
  return matchId.startsWith("am_");
}

/** Action Order house match ids written by the skill runtime. */
export function isActionOrderMatchId(matchId: string): boolean {
  return /^AO-/i.test(matchId);
}

/** Keep skill stats/history scoped to the skill that produced the match. */
export function matchBelongsToSkill(skillId: string, matchId: string): boolean {
  if (isActionOrderSkillId(skillId)) return isActionOrderMatchId(matchId);
  if (isGamearenaSkillId(skillId)) return !isActionOrderMatchId(matchId);
  return true;
}

export function isUbiSkillId(skillId: string): boolean {
  return skillId.includes("ubi");
}

export function skillShortLabel(skillId: string): string {
  return skillId.split("/").pop() ?? skillId;
}

export function dashboardPanelForSkillId(skillId: string): DashboardPanelKind {
  if (isGamearenaSkillId(skillId)) return "gamearena";
  if (isActionOrderSkillId(skillId)) return "actionorder";
  if (isBalaioSkillId(skillId)) return "balaio";
  if (isUbiSkillId(skillId)) return "ubi";
  return "generic";
}

export function skillsFromStatus(
  status: DeploySkillsStatusSource,
): DeploySkillView[] {
  if (status.skills?.length) {
    return status.skills.map((s) => ({
      skillId: s.skillId,
      registryPath: s.registryPath ?? "",
      status: s.status ?? "installed",
      configuration: s.configuration ?? {},
      lastError: s.lastError ?? null,
    }));
  }
  if (!status.skillId) return [];
  let configuration: Record<string, string> = {};
  if (status.configuration) {
    try {
      configuration = JSON.parse(status.configuration) as Record<string, string>;
    } catch {
      configuration = {};
    }
  }
  return [
    {
      skillId: status.skillId,
      registryPath: "",
      status: "installed",
      configuration,
    },
  ];
}

export function skillIdsFromStatus(status: DeploySkillsStatusSource): string[] {
  return skillsFromStatus(status).map((s) => s.skillId);
}

export function hasGamearenaInStatus(status: DeploySkillsStatusSource): boolean {
  return skillIdsFromStatus(status).some((id) => isGamearenaSkillId(id));
}

export function hasBalaioInStatus(status: DeploySkillsStatusSource): boolean {
  return skillIdsFromStatus(status).some((id) => isBalaioSkillId(id));
}

/** All installed skills — every skill has config in the dashboard. */
export function configurableSkillsFromStatus(
  status: DeploySkillsStatusSource,
): DeploySkillView[] {
  return skillsFromStatus(status);
}

export function configForSkill(
  status: DeploySkillsStatusSource,
  skillId: string,
): Record<string, string> {
  const skill = skillsFromStatus(status).find((s) => s.skillId === skillId);
  if (skill?.configuration && Object.keys(skill.configuration).length) {
    return skill.configuration;
  }
  if (status.skillId === skillId && status.configuration) {
    try {
      return JSON.parse(status.configuration) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return {};
}

export function formatSkillList(
  skills: DeploySkillView[] | undefined,
  fallbackSkillId?: string | null,
): string {
  const list = skills?.length
    ? skills.map((s) => skillShortLabel(s.skillId))
    : fallbackSkillId
      ? [skillShortLabel(fallbackSkillId)]
      : [];
  return list.length ? list.join(" + ") : "—";
}

export function deploySkillsLabel(agent: {
  skills?: Array<{ skillId: string }>;
}): string {
  if (!agent.skills?.length) return "—";
  return agent.skills.map((s) => skillShortLabel(s.skillId)).join(" + ");
}

export function isProofOfAlphaSkillId(skillId: string): boolean {
  return skillId.includes("proof_of_alpha");
}

export function deployKindLabel(agent: {
  skills?: Array<{ skillId: string }>;
}): string {
  const ids = agent.skills?.map((s) => s.skillId) ?? [];
  if (ids.some((id) => isGamearenaSkillId(id))) return "GameArena";
  if (ids.some((id) => isActionOrderSkillId(id))) return "ActionOrder";
  if (ids.some((id) => isBalaioSkillId(id))) return "Balaio";
  if (ids.some((id) => isProofOfAlphaSkillId(id))) return "Proof of Alpha";
  if (ids.some((id) => isUbiSkillId(id))) return "UBI Reminder";
  if (ids.length > 1) return "Multi-skill";
  return "Agent";
}

export function skillInstallStatusLabel(status: string): string {
  if (status === "disabled") return "Disabled";
  if (status === "error") return "Error";
  if (status === "pending") return "Pending";
  if (status === "installed") return "Active";
  return status;
}

export function isSkillEnabled(status: string): boolean {
  return status !== "disabled";
}

export function assertDeploySkillCount(skillIds: string[]): void {
  if (skillIds.length < 1) {
    throw new Error("at least one skill is required");
  }
  if (skillIds.length > MAX_DEPLOY_SKILLS) {
    throw new Error(`at most ${MAX_DEPLOY_SKILLS} skills per deploy`);
  }
}
