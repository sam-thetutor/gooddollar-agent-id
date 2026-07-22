#!/usr/bin/env node
/** Merge deploy secrets from local .env into VPS gcopilot .env (never prints values). */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const local = readFileSync(resolve(root, ".env"), "utf8");

function get(key) {
  const m = local.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) return null;
  return m[1].trim().replace(/^"|"$/g, "");
}

const keys = [
  "DEPLOY_MNEMONIC",
  "PRIVATE_KEY",
  "OPERATOR_PRIVATE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "ENCRYPTION_SECRET",
  "HOST_INTERNAL_SECRET",
];

const lines = [
  "",
  "# --- Autonomous agent deploy ---",
  "AGENTS_ROOT=/home/geinz/goodagent/agents",
  "TELEGRAM_BOT_APP_PATH=/home/geinz/gcopilot/apps/telegram-bot",
  "API_BASE=https://goodagentids.xyz/api",
  "HOST_PORT=3010",
  "HOST_DEV_SKIP_PAYMENT=1",
];

for (const key of keys) {
  const val = get(key);
  if (!val) {
    console.error(`missing local ${key}`);
    process.exit(1);
  }
  const quoted = key === "DEPLOY_MNEMONIC" ? `"${val}"` : val;
  lines.push(`${key}=${quoted}`);
}

const payload = lines.join("\n") + "\n";
const b64 = Buffer.from(payload).toString("base64");
execSync(
  `ssh geinz-vps 'echo ${b64} | base64 -d > /home/geinz/gcopilot/.env.deploy && ` +
    `grep -v "^# --- Autonomous agent deploy" /home/geinz/gcopilot/.env | ` +
    `grep -v "^DEPLOY_MNEMONIC=" | grep -v "^PRIVATE_KEY=" | grep -v "^OPERATOR_PRIVATE_KEY=" | ` +
    `grep -v "^TELEGRAM_BOT_TOKEN=" | grep -v "^ENCRYPTION_SECRET=" | grep -v "^HOST_INTERNAL_SECRET=" | ` +
    `grep -v "^AGENTS_ROOT=" | grep -v "^TELEGRAM_BOT_APP_PATH=" | grep -v "^API_BASE=" | ` +
    `grep -v "^HOST_PORT=" | grep -v "^HOST_DEV_SKIP_PAYMENT=" > /home/geinz/gcopilot/.env.tmp && ` +
    `cat /home/geinz/gcopilot/.env.deploy >> /home/geinz/gcopilot/.env.tmp && ` +
    `mv /home/geinz/gcopilot/.env.tmp /home/geinz/gcopilot/.env'`,
  { stdio: "inherit" },
);

execSync(
  `ssh geinz-vps 'grep -E "^(PRIVATE_KEY|OPERATOR_PRIVATE_KEY|DEPLOY_MNEMONIC|HOST_PORT)=" /home/geinz/gcopilot/.env | sed "s/=.*/=***set***/"'`,
  { stdio: "inherit" },
);

console.log("VPS .env merged");
