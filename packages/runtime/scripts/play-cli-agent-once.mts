#!/usr/bin/env node
/** Mint GamePass (if needed) and play one offchain MARKOV match for the CLI deploy. */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { deriveAgentAccount } from "../src/wallet.js";
import {
  readGamePassProfile,
  registerGamePassUsername,
} from "../src/gamearena-pass.js";
import { fetchGamearenaLadder } from "../src/gamearena-ladder.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });

const DEPLOY_ID = "cmrsdzu5f0000kqqgny5plfwy";
const DISPLAY_NAME = "MARKOV Fixed Rock";
const DERIVATION_INDEX = 28;
const RPC = process.env.CELO_RPC_URL ?? "https://forno.celo.org";

async function ladderSnapshot(wallet: `0x${string}`, label: string) {
  const ladder = await fetchGamearenaLadder(wallet);
  const profile = await readGamePassProfile(wallet, RPC);
  console.log(`\n=== ${label} ===`);
  console.log("GamePass hasMinted:", profile.hasMinted);
  console.log("GamePass username:", profile.username || "(empty)");
  console.log("Ladder rank:", ladder?.rank ?? null);
  console.log("Ladder points:", ladder?.points ?? null);
  console.log("Ladder wins:", ladder?.wins ?? null);
  console.log("Ladder matches:", ladder?.matches ?? null);
  console.log("remainingToday:", ladder?.remainingToday ?? null);
  if (ladder?.error) console.log("ladder error:", ladder.error);
}

async function main() {
  const mnemonic = process.env.DEPLOY_MNEMONIC?.trim();
  if (!mnemonic) throw new Error("DEPLOY_MNEMONIC missing in .env");

  const account = deriveAgentAccount(mnemonic, DERIVATION_INDEX);
  const wallet = account.address;
  console.log("CLI agent wallet:", wallet);

  await ladderSnapshot(wallet, "BEFORE");

  const pass = await registerGamePassUsername({
    rpcUrl: RPC,
    account,
    displayName: DISPLAY_NAME,
    deployId: DEPLOY_ID,
  });
  console.log("\nGamePass registration:", pass);

  // Play one offchain match via installed skill (no VPS proxy).
  const skillDir = resolve(
    process.cwd(),
    "../../../goodagent-skills/skills/gamearena-player",
  );
  const { spawnSync } = await import("node:child_process");
  const run = spawnSync(
    "pnpm",
    ["exec", "tsx", "src/index.ts"],
    {
      cwd: skillDir,
      env: {
        ...process.env,
        PLAYER_ADDRESS: wallet,
        PLAY_MODE: "offchain",
        MARKOV_STRATEGY: "fixed",
        RPS_FIXED: "rock",
        MAX_MATCHES: "1",
        MATCH_INTERVAL_SECONDS: "1",
        CHALLENGE_AI_URL: "https://gamearenahq.xyz",
        CELO_RPC_URL: RPC,
        PATH: process.env.PATH,
      },
      encoding: "utf8",
      timeout: 180_000,
    },
  );
  console.log("\n--- skill stdout ---");
  console.log(run.stdout?.slice(-2500) ?? "");
  if (run.stderr) {
    console.log("\n--- skill stderr ---");
    console.log(run.stderr.slice(-1500));
  }
  if (run.status !== 0) {
    console.error("skill exit:", run.status);
  }

  await ladderSnapshot(wallet, "AFTER");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
