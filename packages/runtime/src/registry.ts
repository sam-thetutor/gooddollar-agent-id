import { existsSync, readFileSync } from "node:fs";

export const SKILLS_REGISTRY_URL =
  "https://raw.githubusercontent.com/sam-thetutor/goodagent-skills/main/registry.json";

export const SKILLS_REPO_URL =
  "https://github.com/sam-thetutor/goodagent-skills.git";

import {
  filterListedSkills,
  isSkillDeployable,
  isSkillListed,
  type RegistrySkillFlags,
} from "@goodagent/shared";

export type { RegistrySkillFlags };
export { filterListedSkills, isSkillDeployable, isSkillListed };

export interface RegistrySkill extends RegistrySkillFlags {
  name: string;
  skill_id: string;
  path: string;
  description: string;
  chain: string;
  spends_tokens: boolean;
  modes?: string[];
  token?: string;
  game?: string;
  game_url?: string;
}

export interface SkillsRegistry {
  version: number;
  skills: RegistrySkill[];
}

export async function fetchSkillsRegistry(): Promise<SkillsRegistry> {
  const localFile = process.env.LOCAL_SKILLS_REGISTRY?.trim();
  if (localFile && existsSync(localFile)) {
    return JSON.parse(readFileSync(localFile, "utf8")) as SkillsRegistry;
  }

  const res = await fetch(SKILLS_REGISTRY_URL);
  if (!res.ok) {
    throw new Error(`registry fetch failed: ${res.status}`);
  }
  return res.json() as Promise<SkillsRegistry>;
}

export function findRegistrySkill(
  registry: SkillsRegistry,
  skillId: string,
): RegistrySkill | undefined {
  return registry.skills.find((s) => s.skill_id === skillId);
}
