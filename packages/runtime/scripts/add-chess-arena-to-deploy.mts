#!/usr/bin/env node
/**
 * Add chess-arena-player to an existing hosted deploy (DB row + disk install + USDT fund).
 * Does not change PM2 / primary skill — use play-once or manual npm start in skill dir.
 *
 * Usage:
 *   pnpm exec tsx packages/runtime/scripts/add-chess-arena-to-deploy.mts <deployId> [--play]
 */
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import {
  getDeployedAgent,
  prisma,
  updateSkillInstall,
} from "@goodagent/db";
import {
  deriveAgentPrivateKey,
  fetchSkillsRegistry,
  findRegistrySkill,
  fundAgentGDollar,
  fundAgentUsdtFromGsByKey,
  getRuntimeConfig,
  installSkillFromRegistry,
  loadRuntimeEnv,
  playChessArenaMatchOnce,
} from "../src/index.js";
import {
  buildChessArenaEnv,
  buildHostReportEnv,
  CHESS_ARENA_MIN_FUNDING_GS,
  CHESS_ARENA_SKILL_ID,
  writeSkillEnv,
} from "../src/skill-env.js";

const DEFAULT_CHESS_CONFIG = {
  PLAY_MODE: "auto",
  SOLVER_ENGINE: "stockfish",
  AUTO_SWAP: "1",
  MAX_MATCHES: "5",
  DAILY_MATCH_CAP: "20",
  MATCH_INTERVAL_SECONDS: "120",
  USDT_STAKE_BUFFER: "1000000",
};

loadEnv({ path: resolve(process.cwd(), ".env"), override: true });
loadEnv({ path: resolve(process.cwd(), "../../.env"), override: true });
loadRuntimeEnv();

const deployId = process.argv[2]?.trim();
const shouldPlay = process.argv.includes("--play");

if (!deployId) {
  console.error(
    "Usage: add-chess-arena-to-deploy.mts <deployId> [--play]",
  );
  process.exit(1);
}

async function ensureSkillInstallRow(
  agent: NonNullable<Awaited<ReturnType<typeof getDeployedAgent>>>,
  registryPath: string,
): Promise<void> {
  const existing = agent.skills.find((s) => s.skillId === CHESS_ARENA_SKILL_ID);
  if (existing) {
    console.log(`[chess-add] skill already in DB (${existing.status})`);
    return;
  }

  await prisma.skillInstall.create({
    data: {
      id: `${deployId}-chess-arena`,
      deployedAgentId: deployId,
      skillId: CHESS_ARENA_SKILL_ID,
      registryPath,
      status: "installed",
      configJson: JSON.stringify(DEFAULT_CHESS_CONFIG),
      activatedAt: new Date(),
    },
  });
  console.log("[chess-add] created skillInstall row");
}

async function main(): Promise<void> {
  const agent = await getDeployedAgent(deployId);
  if (!agent) throw new Error(`deploy not found: ${deployId}`);
  if (!agent.agentAddress || agent.walletDerivationIndex == null) {
    throw new Error("agent wallet not provisioned");
  }

  const registry = await fetchSkillsRegistry();
  const entry = findRegistrySkill(registry, CHESS_ARENA_SKILL_ID);
  if (!entry) throw new Error(`skill not in registry: ${CHESS_ARENA_SKILL_ID}`);

  const config = getRuntimeConfig();
  const agentPrivateKey = deriveAgentPrivateKey(
    config.deployMnemonic,
    agent.walletDerivationIndex,
  );
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(agentPrivateKey);
  if (account.address.toLowerCase() !== agent.agentAddress.toLowerCase()) {
    throw new Error("derived key does not match stored agent address");
  }

  console.log(
    `[chess-add] deploy=${deployId} wallet=${agent.agentAddress} index=${agent.walletDerivationIndex}`,
  );

  await ensureSkillInstallRow(agent, entry.path);

  const skillDir = installSkillFromRegistry(config.agentsRoot, deployId, entry);
  const chessEnv = buildChessArenaEnv(
    agentPrivateKey,
    config.celoRpcUrl,
    DEFAULT_CHESS_CONFIG,
    account.address,
    agent.displayName,
  );
  writeSkillEnv(skillDir, {
    ...chessEnv,
    ...buildHostReportEnv(deployId),
  });

  console.log(`[chess-add] installed at ${skillDir}`);

  if (!existsSync(resolve(skillDir, "node_modules"))) {
    throw new Error("skill npm install failed — node_modules missing");
  }

  await fundAgentGDollar(config, account.address, CHESS_ARENA_MIN_FUNDING_GS);
  console.log(`[chess-add] topped up G$ to at least ${CHESS_ARENA_MIN_FUNDING_GS}`);

  const fund = await fundAgentUsdtFromGsByKey(
    config,
    account.address,
    agentPrivateKey,
    { targetUsdt: 1_000_000n },
  );
  console.log("[chess-add] USDT fund:", {
    swapped: fund.swapped,
    usdtBalance: fund.usdtBalance.toString(),
    txHashes: fund.txHashes,
  });

  await updateSkillInstall(deployId, CHESS_ARENA_SKILL_ID, {
    status: "installed",
    configJson: JSON.stringify(DEFAULT_CHESS_CONFIG),
    activatedAt: new Date(),
    lastError: null,
  });

  console.log("[chess-add] dry-run:");
  const { spawnSync } = await import("node:child_process");
  const dry = spawnSync("npm", ["run", "dry-run"], {
    cwd: skillDir,
    encoding: "utf8",
    timeout: 120_000,
  });
  console.log(dry.stdout?.slice(-2000) ?? "");
  if (dry.status !== 0) {
    console.error(dry.stderr?.slice(-1000) ?? "");
    throw new Error("dry-run failed");
  }

  if (shouldPlay) {
    console.log("[chess-add] playing one match…");
    const play = await playChessArenaMatchOnce(
      config,
      deployId,
      agent.displayName,
      { startTimeoutMs: 180_000 },
    );
    console.log("[chess-add] play result:", play);
    if (!play.matchId) {
      process.exit(1);
    }
  } else {
    console.log(
      `[chess-add] done. Run: cd ${skillDir} && MAX_MATCHES=1 npm start`,
    );
    console.log(
      `[chess-add] or: pnpm exec tsx packages/runtime/scripts/add-chess-arena-to-deploy.mts ${deployId} --play`,
    );
  }
}

main().catch((err) => {
  console.error("[chess-add] failed:", err);
  process.exit(1);
});
