#!/usr/bin/env node
/**
 * Phase 1 spike: deploy a claim-bot agent as a supervised PM2 process.
 *
 * Prerequisites (.env at monorepo root or AGENTS_ROOT):
 *   DEPLOY_MNEMONIC       — HD pool for agent wallets (never commit)
 *   PRIVATE_KEY           — relayer with CELO (attestFor + fund gas)
 *   OPERATOR_PRIVATE_KEY  — GoodDollar-verified operator (bond + issue)
 *   TELEGRAM_BOT_TOKEN    — @BotFather token
 *   DATABASE_URL          — Postgres for TelegramSubscriber
 *   AGENTS_ROOT           — optional, default .goodagent/agents
 *
 * Usage:
 *   pnpm deploy:spike
 *   pnpm deploy:spike -- --name "UBI Reminder Test"
 *   pnpm deploy:spike -- --dry-run
 *   pnpm deploy:spike -- --skip-identity
 */
import { loadRuntimeEnv, getRuntimeConfig } from "../src/config.js";
import { deployClaimBotSpike } from "../src/deploy-claim-bot.js";

function parseArgs(argv: string[]) {
  let displayName = "Claim Bot Spike";
  let dryRun = false;
  let skipIdentity = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name" && argv[i + 1]) {
      displayName = argv[++i];
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--skip-identity") {
      skipIdentity = true;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: deploy-spike [--name "My Bot"] [--dry-run] [--skip-identity]`);
      process.exit(0);
    }
  }

  return { displayName, dryRun, skipIdentity };
}

async function main() {
  loadRuntimeEnv();
  const opts = parseArgs(process.argv.slice(2));
  const config = getRuntimeConfig();

  await deployClaimBotSpike(config, {
    displayName: opts.displayName,
    template: "claim-bot",
    dryRun: opts.dryRun,
    skipIdentity: opts.skipIdentity,
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
