#!/usr/bin/env tsx
/**
 * Smoke-test Proof of Alpha Hunt skill against live API (dry-run by default).
 *
 *   pnpm exec tsx scripts/test-proof-of-alpha-hunt.mts
 *   DRY_RUN=0 PLAYER_ADDRESS=0x… ETHERSCAN_API_KEY=… pnpm exec tsx scripts/test-proof-of-alpha-hunt.mts
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "../../..");
const skillDir = resolve(repoRoot, "../goodagent-skills/skills/proof-of-alpha-hunt");

if (!existsSync(skillDir)) {
  console.error(`Skill not found at ${skillDir}`);
  process.exit(1);
}

const env = {
  ...process.env,
  DRY_RUN: process.env.DRY_RUN ?? "1",
};

const r = spawnSync("npm", ["start"], {
  cwd: skillDir,
  env,
  stdio: "inherit",
});

process.exit(r.status ?? 1);
