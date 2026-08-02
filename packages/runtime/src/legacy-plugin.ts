import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_PLUGIN_ENTRY } from "@goodagent/skill-sdk";

const LEGACY_BRIDGE_SOURCE = `import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ID = {{SKILL_ID}};
const API_VERSION = 1;

/** @type {import("node:child_process").ChildProcess | null} */
let child = null;

const skill = {
  id: SKILL_ID,
  apiVersion: API_VERSION,
  async onStart(ctx) {
    const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    ctx.logger.info("legacy bridge starting npm start", { skillRoot });
    child = spawn("npm", ["start"], {
      cwd: skillRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code, signal) => {
      ctx.logger.warn("legacy skill process exited", { code, signal });
      child = null;
    });
  },
  async onStop(ctx) {
    if (!child) return;
    ctx.logger.info("legacy bridge stopping skill process");
    child.kill("SIGTERM");
    child = null;
  },
};

export default skill;
`;

const PLUGIN_REEXPORT = `export { default } from "./legacy-bridge.js";
`;

/** Generate dist/plugin.js for skills that only ship npm start (pre-plugin migration). */
export function ensureLegacySkillPlugin(
  skillDir: string,
  skillId: string,
): string {
  const entryPath = resolve(skillDir, DEFAULT_PLUGIN_ENTRY);
  if (existsSync(entryPath)) return DEFAULT_PLUGIN_ENTRY;

  const distDir = resolve(skillDir, "dist");
  mkdirSync(distDir, { recursive: true });

  const bridgePath = resolve(distDir, "legacy-bridge.js");
  const bridgeSource = LEGACY_BRIDGE_SOURCE.replace(
    "{{SKILL_ID}}",
    JSON.stringify(skillId),
  );
  writeFileSync(bridgePath, bridgeSource, "utf8");
  writeFileSync(resolve(distDir, "plugin.js"), PLUGIN_REEXPORT, "utf8");
  console.log(`[legacy-plugin] wrote ${entryPath} for ${skillId}`);
  return DEFAULT_PLUGIN_ENTRY;
}

export function skillHasNativePlugin(skillDir: string, entry = DEFAULT_PLUGIN_ENTRY): boolean {
  return existsSync(resolve(skillDir, entry));
}
