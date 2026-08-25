#!/usr/bin/env node
/**
 * Install kasuku-matches on a local agent from the sibling skills repo.
 *
 *   LOCAL_SKILLS_REPO=/path/to/goodagent-skills \
 *   pnpm exec tsx packages/runtime/scripts/install-kasuku-matches-local.mts [deployId]
 *
 * Defaults to the newest local agent dir with a manifest.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  applyDeployConfiguration,
  fetchSkillsRegistry,
  findRegistrySkill,
  getMonorepoRoot,
  getRuntimeConfig,
  installSkillFromRegistry,
  KASUKU_MATCHES_SKILL_ID,
  loadRuntimeEnv,
  provisionBrain,
  writeSkillEnv,
} from "../src/index.js";
import { getDeployedAgent, prisma, upsertSkillInstall } from "@goodagent/db";
import { agentDir, readAgentMeta } from "../src/wallet.js";
import { buildKasukuMatchesEnv, buildHostReportEnv } from "../src/skill-env.js";

const DEFAULT_SKILL_ID = KASUKU_MATCHES_SKILL_ID;

loadEnv({ path: resolve(process.cwd(), ".env"), override: true });
loadRuntimeEnv();

function defaultLocalSkillsPaths(root: string): void {
  if (!process.env.LOCAL_SKILLS_REGISTRY) {
    process.env.LOCAL_SKILLS_REGISTRY = resolve(
      root,
      "../goodagent-skills/registry.json",
    );
  }
  if (!process.env.LOCAL_SKILLS_REPO) {
    process.env.LOCAL_SKILLS_REPO = resolve(root, "../goodagent-skills");
  }
}

function newestAgentWithManifest(agentsRoot: string): string | undefined {
  if (!existsSync(agentsRoot)) return undefined;
  const rows = readdirSync(agentsRoot)
    .map((id) => {
      const dir = resolve(agentsRoot, id);
      const manifest = resolve(dir, "manifest.json");
      if (!existsSync(manifest)) return null;
      return { id, mtime: statSync(manifest).mtimeMs };
    })
    .filter((row): row is { id: string; mtime: number } => Boolean(row))
    .sort((a, b) => b.mtime - a.mtime);
  return rows[0]?.id;
}

type DiskManifest = {
  skills?: Array<{
    skillId: string;
    folder: string;
    entry: string;
    config?: Record<string, string>;
    enabled?: boolean;
    apiVersion?: number;
  }>;
};

function patchDiskManifest(
  deployDir: string,
  skillId: string,
  folder: string,
): void {
  const path = resolve(deployDir, "manifest.json");
  if (!existsSync(path)) return;
  const manifest = JSON.parse(readFileSync(path, "utf8")) as DiskManifest;
  const skills = Array.isArray(manifest.skills) ? [...manifest.skills] : [];
  const already = skills.some((s) => s.skillId === skillId);
  if (!already) {
    skills.push({
      skillId,
      folder,
      entry: "dist/plugin.js",
      config: {},
      enabled: true,
      apiVersion: 1,
    });
    manifest.skills = skills;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

async function main(): Promise<void> {
  const root = getMonorepoRoot();
  defaultLocalSkillsPaths(root);
  const config = getRuntimeConfig();
  const deployId =
    process.argv.slice(2).find((arg) => arg !== "--" && arg.trim())?.trim() ||
    newestAgentWithManifest(config.agentsRoot);
  if (!deployId) {
    throw new Error(`no local agent found under ${config.agentsRoot}`);
  }

  const registry = await fetchSkillsRegistry();
  const entry = findRegistrySkill(registry, DEFAULT_SKILL_ID);
  if (!entry) {
    throw new Error(
      `skill not in registry: ${DEFAULT_SKILL_ID} (set LOCAL_SKILLS_REGISTRY)`,
    );
  }

  const deployDir = agentDir(config.agentsRoot, deployId);
  let meta: ReturnType<typeof readAgentMeta> | undefined;
  try {
    meta = readAgentMeta(config.agentsRoot, deployId);
  } catch {
    meta = undefined;
  }

  const dbAgent = await getDeployedAgent(deployId).catch(() => null);
  const agentAddress = (dbAgent?.agentAddress ?? meta?.address ?? "") as
    | `0x${string}`
    | "";
  const displayName =
    dbAgent?.displayName ?? meta?.displayName ?? "Kasuku matches";

  console.log(`[install] deploy=${deployId} skill=${DEFAULT_SKILL_ID}`);
  const skillDir = installSkillFromRegistry(config.agentsRoot, deployId, entry);
  writeSkillEnv(skillDir, {
    ...buildKasukuMatchesEnv(
      (agentAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      displayName,
    ),
    ...buildHostReportEnv(deployId),
  });
  patchDiskManifest(deployDir, DEFAULT_SKILL_ID, "kasuku-matches");

  if (dbAgent) {
    await upsertSkillInstall(deployId, {
      skillId: DEFAULT_SKILL_ID,
      registryPath: entry.path,
      status: "installed",
    });
    const refreshed = await getDeployedAgent(deployId);
    if (
      refreshed?.agentAddress &&
      refreshed.walletDerivationIndex != null
    ) {
      await applyDeployConfiguration(
        config,
        {
          id: refreshed.id,
          displayName: refreshed.displayName,
          agentAddress: refreshed.agentAddress,
          walletDerivationIndex: refreshed.walletDerivationIndex,
          configuration: refreshed.configuration,
          skills: refreshed.skills,
        },
        {},
        DEFAULT_SKILL_ID,
      );
    }
  }

  const brainManifest = resolve(deployDir, "brain-manifest.json");
  if (existsSync(brainManifest) && agentAddress) {
    const disk = JSON.parse(readFileSync(brainManifest, "utf8")) as {
      brain?: { model?: string; tools?: string[] };
    };
    const skills = dbAgent
      ? (await getDeployedAgent(deployId))?.skills.map((s) => ({
          skillId: s.skillId,
        })) ?? [{ skillId: DEFAULT_SKILL_ID }]
      : [{ skillId: DEFAULT_SKILL_ID }];
    if (!skills.some((s) => s.skillId === DEFAULT_SKILL_ID)) {
      skills.push({ skillId: DEFAULT_SKILL_ID });
    }
    provisionBrain({
      deployId,
      displayName,
      template: dbAgent?.template ?? "gaming",
      agentAddress,
      agentsRoot: config.agentsRoot,
      apiBase: config.apiBase,
      hostUrl:
        process.env.HOST_INTERNAL_URL?.trim() ||
        `http://127.0.0.1:${process.env.HOST_PORT ?? "3002"}`,
      skills,
      settings: {
        botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || "unused",
        model: disk.brain?.model,
        tools: disk.brain?.tools,
      },
    });
    console.log(`[install] re-provisioned brain tools including book_selections`);
  }

  console.log(`[install] skill at ${skillDir}`);
  console.log(`[install] next: cd ${skillDir} && npm start`);
}

main()
  .catch((err) => {
    console.error("[install] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
