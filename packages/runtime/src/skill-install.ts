import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RegistrySkill } from "./registry.js";
import { SKILLS_REPO_URL } from "./registry.js";

export function skillsCacheDir(agentsRoot: string): string {
  return resolve(dirname(agentsRoot), ".skill-registry");
}

export function skillInstallDir(
  agentsRoot: string,
  deployId: string,
  skillFolder: string,
): string {
  return resolve(agentsRoot, deployId, "skills", skillFolder);
}

function skillFolderName(registryPath: string): string {
  return registryPath.split("/").pop() ?? registryPath;
}

/** Clone or update the skills repo cache, then copy one skill into the agent dir. */
export function installSkillFromRegistry(
  agentsRoot: string,
  deployId: string,
  skill: RegistrySkill,
): string {
  const cache = resolve(skillsCacheDir(agentsRoot), "goodagent-skills");
  mkdirSync(skillsCacheDir(agentsRoot), { recursive: true });

  if (existsSync(resolve(cache, ".git"))) {
    console.log(`[skill-install] updating cache ${cache}`);
    execSync("git fetch origin", { cwd: cache, stdio: "inherit" });
    execSync("git reset --hard origin/main", { cwd: cache, stdio: "inherit" });
  } else {
    console.log(`[skill-install] cloning ${SKILLS_REPO_URL}`);
    execSync(`git clone --depth 1 ${JSON.stringify(SKILLS_REPO_URL)} ${JSON.stringify(cache)}`, {
      stdio: "inherit",
      encoding: "utf8",
    });
  }

  const src = resolve(cache, skill.path);
  if (!existsSync(resolve(src, "package.json"))) {
    throw new Error(`skill package.json missing at ${src}`);
  }

  const dest = skillInstallDir(
    agentsRoot,
    deployId,
    skillFolderName(skill.path),
  );
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });

  console.log(`[skill-install] npm ci in ${dest}`);
  execSync("npm ci", { cwd: dest, stdio: "inherit" });

  return dest;
}
