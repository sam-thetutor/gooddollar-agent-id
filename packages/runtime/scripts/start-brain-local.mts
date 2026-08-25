#!/usr/bin/env node
/**
 * Start the local agent brain with Telegram + Gemini (Kasuku key) + host catalog.
 *
 *   BRAIN_BOT_TOKEN=... pnpm --filter @goodagent/runtime exec tsx scripts/start-brain-local.mts [deployId]
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { spawn } from "node:child_process";
import { getMonorepoRoot, getRuntimeConfig, loadRuntimeEnv } from "../src/index.js";
import { agentDir } from "../src/wallet.js";
import { resolveAgentBrainCli } from "../src/brain-provision.js";

function parseDotEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    const comment = v.indexOf(" #");
    if (comment >= 0) v = v.slice(0, comment).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

loadEnv({ path: resolve(process.cwd(), ".env"), override: true });
loadRuntimeEnv();

const deployId =
  process.argv.slice(2).find((arg) => arg !== "--" && arg.trim())?.trim() ||
  "cmsadg4zq0000dtsldarirvih";

const root = getMonorepoRoot();
const config = getRuntimeConfig();
const dir = agentDir(config.agentsRoot, deployId);
const manifestPath = resolve(dir, "brain-manifest.json");
if (!existsSync(manifestPath)) {
  throw new Error(`brain not provisioned: ${manifestPath}`);
}

const token = process.env.BRAIN_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token || token === "local-dev-no-telegram") {
  throw new Error("BRAIN_BOT_TOKEN is required");
}

const kasuku = parseDotEnv(resolve(root, "../bet-copilot-uganda/.env"));
const geminiKey = kasuku.GEMINI_API_KEY?.trim();

const cli = resolveAgentBrainCli();
const child = spawn(process.execPath, [cli, "--manifest", manifestPath], {
  cwd: dir,
  env: {
    ...process.env,
    NODE_ENV: "production",
    TELEGRAM_BOT_TOKEN: token,
    GOODAGENT_HOST_URL:
      process.env.HOST_INTERNAL_URL?.trim() ||
      `http://127.0.0.1:${process.env.HOST_PORT ?? "3002"}`,
    HOST_INTERNAL_SECRET: process.env.HOST_INTERNAL_SECRET,
    DEPLOY_ID: deployId,
    API_BASE: config.apiBase,
    BRAIN_MEMORY_DIR: resolve(dir, "brain-memory"),
    ...(geminiKey
      ? {
          BRAIN_LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
          BRAIN_LLM_API_KEY: geminiKey,
          BRAIN_MODEL: kasuku.GEMINI_MODEL_SMART?.trim() || "gemini-2.5-flash",
        }
      : {}),
  },
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));
