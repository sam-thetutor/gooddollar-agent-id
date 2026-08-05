import type { DeployedAgent, SkillInstall } from "@prisma/client";
import { parseDeployConfiguration } from "./deployed-agents.js";

export function parseSkillInstallConfiguration(
  install: Pick<SkillInstall, "configJson">,
): Record<string, string> {
  if (!install.configJson) return {};
  try {
    const parsed = JSON.parse(install.configJson) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Per-skill config with legacy flat deploy configuration as fallback. */
export function resolveSkillConfiguration(
  agent: Pick<DeployedAgent, "configuration">,
  install: Pick<SkillInstall, "configJson">,
): Record<string, string> {
  const perSkill = parseSkillInstallConfiguration(install);
  if (Object.keys(perSkill).length) return perSkill;
  return parseDeployConfiguration(agent);
}

export function skillFolderFromRegistryPath(registryPath: string): string {
  return registryPath.split("/").pop() ?? registryPath;
}

export function findSkillInstall(
  skills: SkillInstall[],
  skillId: string,
): SkillInstall | undefined {
  return skills.find((s) => s.skillId === skillId);
}

export function findGamearenaSkillInstall(
  skills: SkillInstall[],
): SkillInstall | undefined {
  return skills.find((s) => s.skillId.includes("gamearena"));
}

export function findActionOrderSkillInstall(
  skills: SkillInstall[],
): SkillInstall | undefined {
  return skills.find((s) => s.skillId.includes("actionorder"));
}

export function findEnabledActionOrderSkillInstall(
  skills: SkillInstall[],
): SkillInstall | undefined {
  return skills.find(
    (s) => s.skillId.includes("actionorder") && s.status !== "disabled",
  );
}

/** GameArena skill that is not disabled in manifest/DB. */
export function findEnabledGamearenaSkillInstall(
  skills: SkillInstall[],
): SkillInstall | undefined {
  return skills.find(
    (s) => s.skillId.includes("gamearena") && s.status !== "disabled",
  );
}

export function primarySkillInstall(
  skills: SkillInstall[],
): SkillInstall | undefined {
  return skills[0];
}
