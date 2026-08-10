import { GOODAGENT_API_URL } from "@goodagent/shared";
import type { RegistrySkill } from "./registry.js";
import { parseSkillFrontmatter } from "./skill-frontmatter.js";
import { SKILLS_REPO_URL } from "./registry.js";

export const DEFAULT_PLUGIN_ENTRY = "dist/plugin.js";

export interface SkillInstallManifest {
  skill_id: string;
  name: string;
  description: string;
  version: string;
  chain: string;
  verification_required: false;
  install: {
    type: "npm-worker";
    repo: string;
    path: string;
    entry: string;
    plugin: string;
    start: string;
    required_env: string[];
    permissions: {
      spends_tokens: boolean;
      token?: string;
    };
  };
  urls: {
    skill_md: string;
    env_example: string;
    bundle: string;
    registry_entry: string;
  };
}

export function skillApiUrl(skillId: string, suffix = ""): string {
  const base = `${GOODAGENT_API_URL.replace(/\/$/, "")}/v1/skills`;
  const encoded = skillId
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/${encoded}${suffix}`;
}

export function buildInstallManifest(
  skill: RegistrySkill,
  frontmatter?: { version?: string; required_env?: string[] },
): SkillInstallManifest {
  const plugin = skill.runtime?.entry ?? DEFAULT_PLUGIN_ENTRY;
  return {
    skill_id: skill.skill_id,
    name: skill.name,
    description: skill.description,
    version: frontmatter?.version ?? "1.0.0",
    chain: skill.chain,
    verification_required: false,
    install: {
      type: "npm-worker",
      repo: SKILLS_REPO_URL,
      path: skill.path,
      entry: "npm start",
      plugin,
      start: "npm start",
      required_env: frontmatter?.required_env ?? [],
      permissions: {
        spends_tokens: skill.spends_tokens,
        ...(skill.token ? { token: skill.token } : {}),
      },
    },
    urls: {
      skill_md: skillApiUrl(skill.skill_id, "/skill.md"),
      env_example: skillApiUrl(skill.skill_id, "/env.example"),
      bundle: "https://github.com/sam-thetutor/goodagent-skills/archive/refs/heads/main.zip",
      registry_entry: skillApiUrl(skill.skill_id),
    },
  };
}

export function requiredEnvFromSkillMd(skillMd: string): string[] {
  const { frontmatter } = parseSkillFrontmatter(skillMd);
  return frontmatter.required_env ?? [];
}
