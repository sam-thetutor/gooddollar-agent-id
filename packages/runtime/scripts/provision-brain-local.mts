#!/usr/bin/env node
/**
 * Provision the LLM brain on a local agent dir (persona, tools, ecosystem).
 *
 * Does not start Telegram polling — pass a dedicated BotFather token later.
 *
 *   pnpm --filter @goodagent/runtime exec tsx scripts/provision-brain-local.mts [deployId]
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  getDeployedAgent,
  prisma,
  updateDeployedAgent,
} from "@goodagent/db";
import {
  getMonorepoRoot,
  getRuntimeConfig,
  loadRuntimeEnv,
  provisionBrain,
  validateTelegramBotToken,
  writeEcosystemConfig,
} from "../src/index.js";
import { agentDir, readAgentMeta } from "../src/wallet.js";
import { skillInstallDir } from "../src/skill-install.js";

const DEFAULT_DEPLOY = "cmsadg4zq0000dtsldarirvih";

loadEnv({ path: resolve(process.cwd(), ".env"), override: true });
loadRuntimeEnv();

function newestAgentWithManifest(agentsRoot: string): string | undefined {
  if (!existsSync(agentsRoot)) return undefined;
  const rows = readdirSync(agentsRoot)
    .map((id) => {
      const manifest = resolve(agentsRoot, id, "manifest.json");
      if (!existsSync(manifest)) return null;
      return { id, mtime: statSync(manifest).mtimeMs };
    })
    .filter((row): row is { id: string; mtime: number } => Boolean(row))
    .sort((a, b) => b.mtime - a.mtime);
  return rows[0]?.id;
}

async function main(): Promise<void> {
  const root = getMonorepoRoot();
  const config = getRuntimeConfig();
  const deployId =
    process.argv.slice(2).find((arg) => arg !== "--" && arg.trim())?.trim() ||
    newestAgentWithManifest(config.agentsRoot) ||
    DEFAULT_DEPLOY;

  const deployDir = agentDir(config.agentsRoot, deployId);
  if (!existsSync(resolve(deployDir, "manifest.json"))) {
    throw new Error(`no manifest at ${deployDir}`);
  }

  let meta: ReturnType<typeof readAgentMeta> | undefined;
  try {
    meta = readAgentMeta(config.agentsRoot, deployId);
  } catch {
    meta = undefined;
  }

  const dbAgent = await getDeployedAgent(deployId).catch(() => null);
  const agentAddress =
    dbAgent?.agentAddress ?? meta?.address ?? "";
  const displayName =
    dbAgent?.displayName ?? meta?.displayName ?? "Local agent";
  const template = dbAgent?.template ?? meta?.template ?? "gaming";

  const skills = [
    { skillId: "gaming/wagering/gamearena_1v1" },
    { skillId: "gaming/card-fighter/actionorder_vshouse" },
    { skillId: "sports/analysis/kasuku_matches" },
  ];

  if (!agentAddress) {
    throw new Error(`no agent address for ${deployId}`);
  }

  const botToken = process.env.BRAIN_BOT_TOKEN?.trim();
  if (!botToken) {
    throw new Error("BRAIN_BOT_TOKEN is required");
  }
  const username = await validateTelegramBotToken(botToken);
  console.log(`[brain] telegram @${username}`);

  const brain = provisionBrain({
    deployId,
    displayName,
    template,
    agentAddress,
    agentsRoot: config.agentsRoot,
    apiBase: config.apiBase,
    hostUrl:
      process.env.HOST_INTERNAL_URL?.trim() ||
      `http://127.0.0.1:${process.env.HOST_PORT ?? "3002"}`,
    skills,
    settings: {
      botToken,
      personaPreset: "gaming",
      tools: [
        "verify_address",
        "check_claim_eligibility",
        "agent_stats",
        "search_fixtures",
        "recommend_matches",
        "build_best_slip",
        "book_selections",
      ],
    },
  });

  const skillDir = existsSync(
    resolve(skillInstallDir(config.agentsRoot, deployId, "kasuku-matches"), "package.json"),
  )
    ? skillInstallDir(config.agentsRoot, deployId, "kasuku-matches")
    : resolve(deployDir, "skills", "kasuku-matches");

  writeEcosystemConfig(config, {
    deployId,
    skillDir,
    brain,
  });

  if (dbAgent) {
    await updateDeployedAgent(deployId, {
      brainConfig: JSON.stringify({
        enabled: true,
        personaPreset: "gaming",
      }),
    });
  }

  console.log(`[brain] provisioned ${deployId}`);
  console.log(`[brain] manifest ${brain.manifestPath}`);
  console.log(`[brain] tools include book_selections`);
  console.log(`[brain] repo ${root}`);
}

main()
  .catch((err) => {
    console.error("[brain] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
