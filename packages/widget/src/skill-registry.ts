export const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/sam-thetutor/goodagent-skills/main/registry.json";

export interface RegistrySkillEntry {
  name: string;
  skill_id: string;
  path: string;
  description: string;
  chain: string;
  spends_tokens: boolean;
  listed?: boolean;
  enabled?: boolean;
  modes?: string[];
  token?: string;
  game?: string;
  game_url?: string;
}

export interface SkillRegistry {
  version: number;
  skills: RegistrySkillEntry[];
}

function isSkillListed(skill: {
  listed?: boolean;
  enabled?: boolean;
}): boolean {
  return skill.listed !== false && skill.enabled !== false;
}

function filterListedSkills<T extends RegistrySkillEntry>(skills: T[]): T[] {
  return skills.filter((s) => isSkillListed(s));
}

export async function fetchSkillRegistry(
  url = DEFAULT_REGISTRY_URL,
): Promise<SkillRegistry> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Skill registry fetch failed (${res.status})`);
  return res.json() as Promise<SkillRegistry>;
}

export function listDeployableSkills(registry: SkillRegistry): RegistrySkillEntry[] {
  return filterListedSkills(registry.skills);
}

export function findSkill(
  registry: SkillRegistry,
  skillId: string,
): RegistrySkillEntry | undefined {
  return registry.skills.find((s) => s.skill_id === skillId);
}
