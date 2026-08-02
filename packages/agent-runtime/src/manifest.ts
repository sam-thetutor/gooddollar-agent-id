import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseAgentManifest,
  type AgentManifest,
} from "@goodagent/skill-sdk";

export function loadManifestFromFile(manifestPath: string): AgentManifest {
  const abs = resolve(manifestPath);
  const raw = JSON.parse(readFileSync(abs, "utf8")) as unknown;
  return parseAgentManifest(raw);
}

export function resolveSkillPath(
  manifestPath: string,
  skillFolder: string,
): string {
  return resolve(resolve(manifestPath, ".."), "skills", skillFolder);
}
