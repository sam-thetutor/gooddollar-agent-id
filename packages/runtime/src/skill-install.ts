import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function resolveSkillSource(
  agentsRoot: string,
  skill: RegistrySkill,
): { src: string; fromLocalRepo: boolean } {
  const localRepo = process.env.LOCAL_SKILLS_REPO?.trim();
  if (localRepo && existsSync(localRepo)) {
    const src = resolve(localRepo, skill.path);
    if (existsSync(resolve(src, "package.json"))) {
      return { src, fromLocalRepo: true };
    }
  }

  const cache = resolve(skillsCacheDir(agentsRoot), "goodagent-skills");
  return { src: resolve(cache, skill.path), fromLocalRepo: false };
}

/** Clone or update the skills repo cache, then copy one skill into the agent dir. */
export function installSkillFromRegistry(
  agentsRoot: string,
  deployId: string,
  skill: RegistrySkill,
): string {
  const localRepo = process.env.LOCAL_SKILLS_REPO?.trim();
  const useLocalRepo = Boolean(localRepo && existsSync(localRepo));

  if (!useLocalRepo) {
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
  } else {
    console.log(`[skill-install] using LOCAL_SKILLS_REPO ${localRepo}`);
  }

  const { src } = resolveSkillSource(agentsRoot, skill);
  if (!existsSync(resolve(src, "package.json"))) {
    throw new Error(`skill package.json missing at ${src}`);
  }

  const dest = skillInstallDir(
    agentsRoot,
    deployId,
    skillFolderName(skill.path),
  );
  const stateBackupPath = resolve(dest, "state.json");
  const envBackupPath = resolve(dest, ".env");
  const stateBackup = existsSync(stateBackupPath)
    ? readFileSync(stateBackupPath)
    : null;
  const envBackup = existsSync(envBackupPath)
    ? readFileSync(envBackupPath, "utf8")
    : null;
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  if (stateBackup) {
    writeFileSync(resolve(dest, "state.json"), stateBackup);
  }
  if (envBackup) {
    writeFileSync(resolve(dest, ".env"), envBackup);
  }

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
