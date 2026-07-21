#!/usr/bin/env node
/**
 * Provision a local Balaio worker agent through awaiting_vouch (no PM2 start).
 *
 * Prerequisites (.env at monorepo root):
 *   DEPLOY_MNEMONIC, PRIVATE_KEY, DATABASE_URL, AGENTS_ROOT (optional)
 *
 * Optional:
 *   LOCAL_SKILLS_REGISTRY — defaults to ../goodagent-skills/registry.json
 *   LOCAL_SKILLS_REPO       — defaults to ../goodagent-skills
 *   BALAIO_OWNER_WALLET     — defaults to 0x85A4…Dd7
 *
 * Usage:
 *   pnpm deploy:balaio-local
 *   pnpm deploy:balaio-local -- --name "Balaio Time Traveller"
 */
import { resolve } from "node:path";
import {
  createDeployedAgent,
  maxWalletDerivationIndex,
  skipPaymentForDeploy,
  updateDeployedAgent,
} from "@goodagent/db";
import {
  BALAIO_WORKER_SKILL_ID,
  fetchSkillsRegistry,
  findRegistrySkill,
  getMonorepoRoot,
  getRuntimeConfig,
  loadRuntimeEnv,
  runDeployPipeline,
} from "../src/index.js";

const DEFAULT_OWNER = "0x85A4b09fb0788f1C549a68dC2EdAe3F97aeb5Dd7";

function parseArgs(argv: string[]) {
  let displayName = "Balaio Time Traveller Agent";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name" && argv[i + 1]) {
      displayName = argv[++i];
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: deploy-balaio-local [--name "My Balaio Agent"]`);
      process.exit(0);
    }
  }
  return { displayName };
}

async function main() {
  loadRuntimeEnv();
  const root = getMonorepoRoot();
  if (!process.env.LOCAL_SKILLS_REGISTRY) {
    process.env.LOCAL_SKILLS_REGISTRY = resolve(
      root,
      "../goodagent-skills/registry.json",
    );
  }
  if (!process.env.LOCAL_SKILLS_REPO) {
    process.env.LOCAL_SKILLS_REPO = resolve(root, "../goodagent-skills");
  }

  const { displayName } = parseArgs(process.argv.slice(2));
  const ownerWallet = (process.env.BALAIO_OWNER_WALLET ?? DEFAULT_OWNER).toLowerCase();
  const config = getRuntimeConfig();

  const registry = await fetchSkillsRegistry();
  const skill = findRegistrySkill(registry, BALAIO_WORKER_SKILL_ID);
  if (!skill) {
    throw new Error(`skill not in registry: ${BALAIO_WORKER_SKILL_ID}`);
  }

  const skillConfiguration = {
    SCAN_INTERVAL_SECONDS: "300",
    MIN_REWARD: "500",
    REWARD_TOKENS: "G$",
    MAX_TASKS_PER_RUN: "1",
  };

  console.log(`\n=== balaio local deploy: ${displayName} ===\n`);

  let agent = await createDeployedAgent({
    displayName,
    template: "work",
    ownerWallet,
    skills: [{ skillId: skill.skill_id, registryPath: skill.path }],
    configuration: skillConfiguration,
  });
  agent = await skipPaymentForDeploy(agent.id);

  const minDerivationIndex = await maxWalletDerivationIndex();

  const result = await runDeployPipeline(
    config,
    {
      deployId: agent.id,
      displayName,
      ownerWallet: ownerWallet as `0x${string}`,
      template: "work",
      skillId: skill.skill_id,
      skillConfiguration,
      skipIdentity: false,
      minDerivationIndex,
    },
    {
      onStatus: async (status, fields) => {
        await updateDeployedAgent(agent.id, {
          status,
          ...fields,
        });
        console.log(`[status] ${status}`, fields ?? {});
      },
    },
  );

  const issueBase =
    process.env.VITE_WEB_ORIGIN?.trim() ?? "http://localhost:5173";
  const issueUrl = `${issueBase}/issue?agent=${result.agentAddress}&deploy=${result.deployId}`;

  console.log("\n=== awaiting vouch ===");
  console.log(`deployId:  ${result.deployId}`);
  console.log(`agent:     ${result.agentAddress}`);
  console.log(`skillDir:  ${result.skillDir}`);
  console.log(`verify:    ${result.verifyUrl}`);
  console.log(`vouch:     ${issueUrl}`);
  console.log("\nAfter vouch succeeds, start monitoring with:");
  console.log(`  cd ${result.skillDir} && npm start`);
  console.log(`  # or: pm2 start ${result.ecosystemPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
