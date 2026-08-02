import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  isGoodAgentSkill,
  type AgentManifestSkill,
  type GoodAgentSkill,
} from "@goodagent/skill-sdk";

export interface LoadedSkill {
  manifest: AgentManifestSkill;
  plugin: GoodAgentSkill;
  dir: string;
}

export async function loadSkillPlugin(
  skillDir: string,
  entry: string,
): Promise<GoodAgentSkill> {
  const entryPath = resolve(skillDir, entry);
  const mod = (await import(pathToFileURL(entryPath).href)) as {
    default?: unknown;
    skill?: unknown;
  };
  const candidate = mod.default ?? mod.skill;
  if (!isGoodAgentSkill(candidate)) {
    throw new Error(
      `Invalid plugin at ${entryPath}: export a GoodAgentSkill as default or named 'skill'`,
    );
  }
  return candidate;
}

export async function loadSkillsFromManifest(
  manifestPath: string,
  skills: AgentManifestSkill[],
): Promise<LoadedSkill[]> {
  const agentRoot = resolve(manifestPath, "..");
  const loaded: LoadedSkill[] = [];

  for (const skill of skills) {
    if (!skill.enabled) continue;
    const dir = resolve(agentRoot, "skills", skill.folder);
    const plugin = await loadSkillPlugin(dir, skill.entry);
    if (plugin.id !== skill.skillId) {
      console.warn(
        `[runtime] plugin id mismatch: manifest=${skill.skillId} plugin=${plugin.id}`,
      );
    }
    loaded.push({ manifest: skill, plugin, dir });
  }

  if (!loaded.length) {
    throw new Error("No enabled skills in manifest");
  }

  return loaded;
}
