import { existsSync, readFileSync } from "node:fs";

export const SKILLS_REGISTRY_URL =
  "https://raw.githubusercontent.com/sam-thetutor/goodagent-skills/main/registry.json";

export const SKILLS_REPO_URL =
  "https://github.com/sam-thetutor/goodagent-skills.git";

export const SKILLS_REPO_RAW_BASE =
  "https://raw.githubusercontent.com/sam-thetutor/goodagent-skills/main";

import {
  filterListedSkills,
  isSkillDeployable,
  isSkillListed,
  type RegistrySkillCapabilities,
  type RegistrySkillCompatibility,
  type RegistrySkillDashboard,
  type RegistrySkillFlags,
  type RegistrySkillRuntime,
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
  runtime?: RegistrySkillRuntime;
  capabilities?: RegistrySkillCapabilities;
  compatibility?: RegistrySkillCompatibility;
  dashboard?: RegistrySkillDashboard;
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

export function searchRegistrySkills(
  registry: SkillsRegistry,
  query: string,
  opts?: { listedOnly?: boolean },
): RegistrySkill[] {
  const q = query.trim().toLowerCase();
  if (!q) return registry.skills;

  const listedOnly = opts?.listedOnly ?? true;
  return registry.skills.filter((skill) => {
    if (listedOnly && skill.listed === false) return false;
    const haystack = [
      skill.skill_id,
      skill.name,
      skill.description,
      skill.game ?? "",
      skill.chain,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export async function fetchSkillMarkdown(
  skill: RegistrySkill,
  rawBase?: string,
): Promise<string> {
  const base = rawBase?.trim() || process.env.SKILLS_REPO_RAW_BASE?.trim() || SKILLS_REPO_RAW_BASE;
  const url = `${base.replace(/\/$/, "")}/${skill.path}/SKILL.md`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`SKILL.md fetch failed: ${res.status} (${url})`);
  }
  return res.text();
}

export async function fetchSkillEnvExample(
  skill: RegistrySkill,
  rawBase?: string,
): Promise<string | null> {
  const base = rawBase?.trim() || process.env.SKILLS_REPO_RAW_BASE?.trim() || SKILLS_REPO_RAW_BASE;
  const url = `${base.replace(/\/$/, "")}/${skill.path}/.env.example`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`.env.example fetch failed: ${res.status} (${url})`);
  }
  return res.text();
}
