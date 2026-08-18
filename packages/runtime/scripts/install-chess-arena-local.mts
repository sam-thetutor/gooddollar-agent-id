#!/usr/bin/env node
/**
 * Install chess-arena-player on a local agent dir and wire .env from HD wallet.
 *
 * Usage:
 *   LOCAL_SKILLS_REPO=/path/to/goodagent-skills \
 *   pnpm exec tsx packages/runtime/scripts/install-chess-arena-local.mts <deployId> [derivationIndex]
 *
 * Defaults: deployId=cmrsdzu5f0000kqqgny5plfwy derivationIndex=28 (CLI MARKOV agent)
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  deriveAgentPrivateKey,
  getRuntimeConfig,
  installSkillFromRegistry,
  loadRuntimeEnv,
  writeEcosystemConfig,
} from "../src/index.js";
import { fetchSkillsRegistry, findRegistrySkill } from "../src/registry.js";
import { agentDir, readAgentMeta, writeAgentMeta } from "../src/wallet.js";
import {
  buildChessArenaEnv,
  buildHostReportEnv,
  CHESS_ARENA_SKILL_ID,
  writeSkillEnv,
} from "../src/skill-env.js";

const DEFAULT_DEPLOY_ID = "cmrsdzu5f0000kqqgny5plfwy";
const DEFAULT_DERIVATION_INDEX = 28;

loadEnv({ path: resolve(process.cwd(), ".env"), override: true });
loadRuntimeEnv();

async function main(): Promise<void> {
  const deployId = process.argv[2]?.trim() || DEFAULT_DEPLOY_ID;
  const derivationIndex = Number(process.argv[3] ?? DEFAULT_DERIVATION_INDEX);
  const config = getRuntimeConfig();

  const registry = await fetchSkillsRegistry();
  const entry = findRegistrySkill(registry, CHESS_ARENA_SKILL_ID);
  if (!entry) {
    throw new Error(`skill not in registry: ${CHESS_ARENA_SKILL_ID}`);
  }

  const agentPrivateKey = deriveAgentPrivateKey(config.deployMnemonic, derivationIndex);
  const account = await import("viem/accounts").then(({ privateKeyToAccount }) =>
    privateKeyToAccount(agentPrivateKey),
  );
  const agentAddress = account.address;

  mkdirSync(agentDir(config.agentsRoot, deployId), { recursive: true });
  mkdirSync(resolve(agentDir(config.agentsRoot, deployId), "logs"), { recursive: true });

  let existing: ReturnType<typeof readAgentMeta> | undefined;
  try {
    existing = readAgentMeta(config.agentsRoot, deployId);
  } catch {
    existing = undefined;
  }

  writeAgentMeta(config.agentsRoot, {
    deployId,
    displayName: existing?.displayName ?? "CLI Chess Arena Test",
    template: existing?.template ?? "gaming",
    address: agentAddress,
    derivationIndex,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });

  console.log(`[install] deploy=${deployId} wallet=${agentAddress} index=${derivationIndex}`);

  const skillDir = installSkillFromRegistry(config.agentsRoot, deployId, entry);
  const chessEnv = buildChessArenaEnv(
    agentPrivateKey,
    config.celoRpcUrl,
    {
      PLAY_MODE: "auto",
      AUTO_SWAP: "1",
      MAX_MATCHES: "1",
      MATCH_INTERVAL_SECONDS: "30",
      DAILY_MATCH_CAP: "5",
    },
    agentAddress,
    existing?.displayName ?? "CLI Chess Arena Test",
  );
  writeSkillEnv(skillDir, {
    ...chessEnv,
    ...buildHostReportEnv(deployId),
  });

  const ecosystemPath = writeEcosystemConfig(config, {
    deployId,
    skillDir,
    env: chessEnv,
  });

  console.log(`[install] skill at ${skillDir}`);
  console.log(`[install] ecosystem ${ecosystemPath}`);
  console.log(`[install] next: cd ${skillDir} && npm run dry-run`);
  console.log(`[install] play:  MAX_MATCHES=1 npm start`);
}

main().catch((err) => {
  console.error("[install] failed:", err);
  process.exit(1);
});
