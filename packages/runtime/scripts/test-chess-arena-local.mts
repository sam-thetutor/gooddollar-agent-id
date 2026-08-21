#!/usr/bin/env node
/** Fund CLI agent G$ + USDT, then play one chess arena match. */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { spawnSync } from "node:child_process";
import {
  fundAgentGDollar,
  fundAgentUsdtFromGsByKey,
  getRuntimeConfig,
  loadRuntimeEnv,
  deriveAgentPrivateKey,
} from "../src/index.js";
import { CHESS_ARENA_MIN_FUNDING_GS } from "../src/skill-env.js";

loadEnv({ path: resolve(process.cwd(), "../../.env"), override: true });
loadRuntimeEnv();

const DEPLOY_ID = process.argv[2]?.trim() ?? "cmrsdzu5f0000kqqgny5plfwy";
const INDEX = Number(process.argv[3] ?? 28);
const SKILL_DIR = resolve(
  getRuntimeConfig().agentsRoot,
  DEPLOY_ID,
  "skills/chess-arena-player",
);

async function main(): Promise<void> {
  const config = getRuntimeConfig();
  const pk = deriveAgentPrivateKey(config.deployMnemonic, INDEX);
  const agent = (await import("viem/accounts")).privateKeyToAccount(pk).address;

  console.log(`[test] agent ${agent} deploy ${DEPLOY_ID}`);

  await fundAgentGDollar(config, agent, CHESS_ARENA_MIN_FUNDING_GS);

  const swap = await fundAgentUsdtFromGsByKey(config, agent, pk, {
    targetUsdt: 1_000_000n,
    minGsReserve: 50n * 10n ** 18n,
  });
  console.log("[test] swap result:", swap);

  const run = spawnSync("npm", ["start"], {
    cwd: SKILL_DIR,
    env: {
      ...process.env,
      MAX_MATCHES: "1",
      MATCH_INTERVAL_SECONDS: "5",
      PLAY_MODE: "auto",
      AUTO_SWAP: "1",
    },
    encoding: "utf8",
    timeout: 600_000,
  });

  console.log("\n--- stdout (tail) ---");
  console.log(run.stdout?.slice(-4000) ?? "");
  if (run.stderr) {
    console.log("\n--- stderr (tail) ---");
    console.log(run.stderr.slice(-2000));
  }
  process.exit(run.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
