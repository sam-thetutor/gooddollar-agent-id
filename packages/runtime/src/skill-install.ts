import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import type { RegistrySkill } from "./registry.js";
import {
  copySkillIntoDeployDir,
  ensureSkillsRepoCache,
} from "./skill-local-install.js";

export function skillsCacheDir(agentsRoot: string): string {
  return resolve(dirname(agentsRoot), ".skill-registry", "goodagent-skills");
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
  const cacheRoot = ensureSkillsRepoCache(skillsCacheDir(agentsRoot));
  const dest = skillInstallDir(
    agentsRoot,
    deployId,
    skillFolderName(skill.path),
  );

  copySkillIntoDeployDir(skill, cacheRoot, dest);

  console.log(`[skill-install] npm ci in ${dest}`);
  try {
    execSync("npm ci", { cwd: dest, stdio: "pipe", encoding: "utf8" });
  } catch (err) {
    const detail =
      err && typeof err === "object" && "stdout" in err && "stderr" in err
        ? `${String((err as { stdout?: string }).stdout ?? "").trim()}\n${String((err as { stderr?: string }).stderr ?? "").trim()}`.trim()
        : err instanceof Error
          ? err.message
          : String(err);
    console.warn(`[skill-install] npm ci failed in ${dest}, retrying with npm install`);
    try {
      execSync("npm install", { cwd: dest, stdio: "pipe", encoding: "utf8" });
    } catch (installErr) {
      const installDetail =
        installErr &&
        typeof installErr === "object" &&
        "stdout" in installErr &&
        "stderr" in installErr
          ? `${String((installErr as { stdout?: string }).stdout ?? "").trim()}\n${String((installErr as { stderr?: string }).stderr ?? "").trim()}`.trim()
          : installErr instanceof Error
            ? installErr.message
            : String(installErr);
      throw new Error(
        `skill npm install failed in ${dest}${detail ? `\nnpm ci: ${detail}` : ""}${installDetail ? `\nnpm install: ${installDetail}` : ""}`,
      );
    }
  }

  return dest;
}
