export const SKILLS_REGISTRY_URL =
  "https://raw.githubusercontent.com/sam-thetutor/goodagent-skills/main/registry.json";

export const SKILLS_REPO_URL =
  "https://github.com/sam-thetutor/goodagent-skills.git";

export interface RegistrySkill {
  name: string;
  skill_id: string;
  path: string;
  description: string;
  chain: string;
  spends_tokens: boolean;
  token?: string;
  game?: string;
  game_url?: string;
}

export interface SkillsRegistry {
  version: number;
  skills: RegistrySkill[];
}

export async function fetchSkillsRegistry(): Promise<SkillsRegistry> {
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
