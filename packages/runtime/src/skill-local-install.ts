import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { RegistrySkill } from "./registry.js";
import { SKILLS_REPO_URL } from "./registry.js";

export interface LocalInstallResult {
  targetDir: string;
  skill_id: string;
  name: string;
  envExamplePath: string | null;
}

export interface InstallSkillLocallyOptions {
  skill: RegistrySkill;
  targetDir: string;
  cacheRoot?: string;
  skipNpm?: boolean;
  quiet?: boolean;
}

export function defaultSkillsCacheDir(): string {
  const base =
    process.env.GOODAGENT_SKILLS_CACHE?.trim() ||
    resolve(process.cwd(), ".goodagent", "skill-registry");
  return resolve(base, "goodagent-skills");
}

function skillFolderName(registryPath: string): string {
  return registryPath.split("/").pop() ?? registryPath;
}

function resolveSkillSource(skill: RegistrySkill, cacheRoot: string): string {
  const localRepo = process.env.LOCAL_SKILLS_REPO?.trim();
  if (localRepo && existsSync(localRepo)) {
    const src = resolve(localRepo, skill.path);
    if (existsSync(resolve(src, "package.json"))) {
      return src;
    }
  }
  return resolve(cacheRoot, skill.path);
}

/** Clone or update the skills repo cache. */
export function ensureSkillsRepoCache(
  cacheRoot: string = defaultSkillsCacheDir(),
): string {
  const localRepo = process.env.LOCAL_SKILLS_REPO?.trim();
  if (localRepo && existsSync(localRepo)) {
    return localRepo;
  }

  mkdirSync(dirname(cacheRoot), { recursive: true });

  if (existsSync(resolve(cacheRoot, ".git"))) {
    execSync("git fetch origin", { cwd: cacheRoot, stdio: "pipe", encoding: "utf8" });
    execSync("git reset --hard origin/main", {
      cwd: cacheRoot,
      stdio: "pipe",
      encoding: "utf8",
    });
  } else {
    execSync(
      `git clone --depth 1 ${JSON.stringify(SKILLS_REPO_URL)} ${JSON.stringify(cacheRoot)}`,
      { stdio: "pipe", encoding: "utf8" },
    );
  }

  return cacheRoot;
}

/**
 * Install a registry skill into a local directory (self-hosted / external agent).
 * Does not require GoodAgent host deploy or identity verification.
 */
export function installSkillLocally(
  opts: InstallSkillLocallyOptions,
): LocalInstallResult {
  const cacheRoot = ensureSkillsRepoCache(opts.cacheRoot ?? defaultSkillsCacheDir());
  const src = resolveSkillSource(opts.skill, cacheRoot);

  if (!existsSync(resolve(src, "package.json"))) {
    throw new Error(`skill package.json missing at ${src}`);
  }

  const dest = resolve(opts.targetDir);
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });

  const envExampleDest = resolve(dest, ".env.example");
  if (!opts.skipNpm) {
    const stdio = opts.quiet ? "pipe" : "inherit";
    try {
      execSync("npm ci", { cwd: dest, stdio, encoding: "utf8" });
    } catch {
      execSync("npm install", { cwd: dest, stdio, encoding: "utf8" });
    }
  }

  return {
    targetDir: dest,
    skill_id: opts.skill.skill_id,
    name: opts.skill.name,
    envExamplePath: existsSync(envExampleDest) ? envExampleDest : null,
  };
}

export function defaultLocalInstallDir(
  workspaceRoot: string,
  skill: RegistrySkill,
): string {
  return resolve(workspaceRoot, "skills", skillFolderName(skill.path));
}

export function readInstalledEnvExample(targetDir: string): string | null {
  const path = resolve(targetDir, ".env.example");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/** Copy skill from cache into deploy dir, preserving state.json and .env if present. */
export function copySkillIntoDeployDir(
  skill: RegistrySkill,
  cacheRoot: string,
  dest: string,
): void {
  const src = resolveSkillSource(skill, cacheRoot);
  if (!existsSync(resolve(src, "package.json"))) {
    throw new Error(`skill package.json missing at ${src}`);
  }

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
}
