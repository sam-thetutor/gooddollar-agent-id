#!/usr/bin/env node
/**
 * One-shot brain chat against the local Kasuku catalog (no Telegram).
 *
 * Uses Groq from the sibling Kasuku .env when present, else local Ollama.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  createBrain,
  createBuiltinTools,
  createLlmClient,
  createSessionMemory,
  buildSystemPrompt,
  loadBrainConfig,
  createConsoleLogger,
} from "@goodagent/agent-brain";
import { getMonorepoRoot, getRuntimeConfig, loadRuntimeEnv } from "../src/index.js";
import { agentDir } from "../src/wallet.js";

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

async function main(): Promise<void> {
  const root = getMonorepoRoot();
  const config = getRuntimeConfig();
  const deployId =
    process.argv.slice(2).find((arg) => arg !== "--" && !arg.startsWith("-"))?.trim() ||
    "cmsadg4zq0000dtsldarirvih";
  const prompt =
    process.argv.includes("--prompt")
      ? process.argv[process.argv.indexOf("--prompt") + 1] ?? ""
      : "Build me a 3-odd football slip for upcoming games and book it on Betpawa. Give me the booking code and link.";
  if (!prompt.trim()) throw new Error("empty --prompt");

  const manifestPath = resolve(
    agentDir(config.agentsRoot, deployId),
    "brain-manifest.json",
  );
  if (!existsSync(manifestPath)) {
    throw new Error(`brain not provisioned: ${manifestPath}`);
  }

  const kasukuEnv = parseDotEnv(resolve(root, "../bet-copilot-uganda/.env"));
  const geminiKey = kasukuEnv.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    process.env.BRAIN_LLM_BASE_URL =
      "https://generativelanguage.googleapis.com/v1beta/openai";
    process.env.BRAIN_LLM_API_KEY = geminiKey;
    process.env.BRAIN_MODEL =
      kasukuEnv.GEMINI_MODEL_SMART?.trim() || "gemini-2.5-flash";
  } else {
    process.env.BRAIN_LLM_BASE_URL =
      process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1";
    process.env.BRAIN_MODEL = "qwen2.5:3b";
  }

  process.env.GOODAGENT_HOST_URL =
    process.env.HOST_INTERNAL_URL?.trim() ||
    `http://127.0.0.1:${process.env.HOST_PORT ?? "3002"}`;
  process.env.DEPLOY_ID = deployId;
  process.env.BRAIN_MEMORY_DIR = resolve(
    agentDir(config.agentsRoot, deployId),
    "brain-memory",
  );

  const brainConfig = loadBrainConfig(process.env, manifestPath);
  const logger = createConsoleLogger("brain-chat");
  const toolNames = brainConfig.toolNames.filter((name) => !name.startsWith("amplify_"));
  logger.info("starting one-shot", {
    model: brainConfig.model,
    llm: brainConfig.llmBaseUrl,
    tools: toolNames,
  });

  const llm = createLlmClient({
    baseUrl: brainConfig.llmBaseUrl,
    apiKey: brainConfig.llmApiKey,
    model: brainConfig.model,
    maxTokens: 1024,
    timeoutMs: 90_000,
  });
  const tools = createBuiltinTools(toolNames, {
    apiBase: brainConfig.apiBase,
    hostUrl: brainConfig.hostUrl,
    deployId: brainConfig.deployId,
    hostInternalSecret: brainConfig.hostInternalSecret,
  });
  const brain = createBrain({
    llm,
    tools,
    systemPrompt: buildSystemPrompt({
      personaPath: brainConfig.personaPath,
      knowledgePaths: brainConfig.knowledgePaths,
    }),
    memory: createSessionMemory({ persistDir: brainConfig.memoryDir }),
    logger,
    maxToolRounds: 4,
  });

  const reply = await brain.handleMessage("local-e2e", prompt);
  console.log("\n=== BRAIN REPLY ===\n");
  console.log(reply);
  console.log("\n=== END ===\n");
  const booked = /booking code|betpawa\.ug\/\?bookingCode=|[A-Z0-9]{5,10}/i.test(reply);
  if (!booked) process.exit(3);
}

main().catch((err) => {
  console.error("[brain-chat] failed:", err);
  process.exit(1);
});
