import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentManifest } from "@goodagent/skill-sdk";

export function writeAgentManifestFile(
  agentDir: string,
  manifest: AgentManifest,
): string {
  const manifestPath = resolve(agentDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`[manifest] wrote ${manifestPath}`);
  return manifestPath;
}
