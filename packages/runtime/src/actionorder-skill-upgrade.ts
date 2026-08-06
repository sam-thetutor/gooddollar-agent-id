import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACTIONORDER_MIN_SECURE_SKILL_VERSION,
  ACTIONORDER_SKILL_ID,
} from "@goodagent/shared";
import type { RuntimeConfig } from "./config.js";
import { actionorderSkillDir } from "./actionorder-play-once.js";
import { fetchSkillsRegistry, findRegistrySkill } from "./registry.js";
import { installSkillFromRegistry } from "./skill-install.js";
import { writeSkillEnv } from "./skill-env.js";

function parseDotEnv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function readPackageVersion(skillDir: string): string | null {
  const pkgPath = resolve(skillDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version?.trim() ?? null;
  } catch {
    return null;
  }
}

function semverAtLeast(current: string, minimum: string): boolean {
  const parse = (v: string) =>
    v.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [cMaj, cMin, cPatch] = parse(current);
  const [mMaj, mMin, mPatch] = parse(minimum);
  if (cMaj !== mMaj) return cMaj > mMaj;
  if (cMin !== mMin) return cMin > mMin;
  return cPatch >= mPatch;
}

/** True when the installed skill uses start + secure resolve (CELO-cards contract). */
export function isActionOrderSkillSecure(skillDir: string): boolean {
  const version = readPackageVersion(skillDir);
  if (version && semverAtLeast(version, ACTIONORDER_MIN_SECURE_SKILL_VERSION)) {
    return true;
  }

  const clientPath = resolve(skillDir, "src/client.ts");
  if (!existsSync(clientPath)) return false;
  const src = readFileSync(clientPath, "utf8");
  return (
    src.includes("startMatch") &&
    src.includes("x-agent-key") &&
    src.includes("ResolveRoundRequest")
  );
}

function readSkillEnv(skillDir: string): Record<string, string> {
  const envPath = resolve(skillDir, ".env");
  if (!existsSync(envPath)) return {};
  try {
    return parseDotEnv(readFileSync(envPath, "utf8"));
  } catch {
    return {};
  }
}

function mergeHostAgentKey(env: Record<string, string>): Record<string, string> {
  const hostKey = process.env.ACTIONORDER_AGENT_API_KEY?.trim();
  if (hostKey) {
    env.ACTIONORDER_AGENT_API_KEY = hostKey;
  }
  return env;
}

/** Reinstall actionorder-player from registry and restore prior .env + host agent key. */
export async function upgradeActionOrderSkillInstall(
  config: RuntimeConfig,
  deployId: string,
): Promise<string> {
  const skillDir = actionorderSkillDir(config.agentsRoot, deployId);
  const priorEnv = readSkillEnv(skillDir);

  const registry = await fetchSkillsRegistry();
  const skill = findRegistrySkill(registry, ACTIONORDER_SKILL_ID);
  if (!skill) {
    throw new Error(`skill not in registry: ${ACTIONORDER_SKILL_ID}`);
  }
  const dest = installSkillFromRegistry(config.agentsRoot, deployId, skill);
  writeSkillEnv(dest, mergeHostAgentKey(priorEnv));
  return dest;
}

export interface PatchActionOrderSecureSkillsResult {
  upgraded: number;
  alreadySecure: number;
}

/** Upgrade every hosted Action Order skill missing the secure CELO-cards client. */
export async function patchAllActionOrderSecureSkills(
  config: RuntimeConfig,
): Promise<PatchActionOrderSecureSkillsResult> {
  let upgraded = 0;
  let alreadySecure = 0;
  const root = config.agentsRoot;
  if (!existsSync(root)) {
    return { upgraded, alreadySecure };
  }

  const registry = await fetchSkillsRegistry();
  const skill = findRegistrySkill(registry, ACTIONORDER_SKILL_ID);
  if (!skill) {
    console.warn(
      `[actionorder-upgrade] skill not in registry: ${ACTIONORDER_SKILL_ID}`,
    );
    return { upgraded, alreadySecure };
  }

  for (const deployId of readdirSync(root)) {
    const skillDir = actionorderSkillDir(root, deployId);
    if (!existsSync(resolve(skillDir, "package.json"))) continue;

    if (isActionOrderSkillSecure(skillDir)) {
      alreadySecure += 1;
      writeSkillEnv(skillDir, mergeHostAgentKey(readSkillEnv(skillDir)));
      continue;
    }

    const priorEnv = readSkillEnv(skillDir);
    console.log(
      `[actionorder-upgrade] upgrading ${deployId} to secure actionorder-player`,
    );
    installSkillFromRegistry(root, deployId, skill);
    writeSkillEnv(skillDir, mergeHostAgentKey(priorEnv));
    upgraded += 1;
  }

  return { upgraded, alreadySecure };
}
