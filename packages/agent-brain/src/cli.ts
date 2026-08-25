#!/usr/bin/env node
import { loadBrainConfig } from "./config.js";
import { createLlmClient } from "./llm.js";
import { createSessionMemory } from "./memory.js";
import { buildSystemPrompt } from "./persona.js";
import { createBrain } from "./orchestrator.js";
import { createBuiltinTools } from "./tools/index.js";
import { createTelegramChannel } from "./channels/telegram.js";
import { createControlClient } from "./control.js";
import { createConsoleLogger } from "./types.js";

function parseArgs(argv: string[]): { manifestPath?: string } {
  let manifestPath: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest" || arg === "-m") {
      manifestPath = argv[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: goodagent-brain --manifest <path>

Runs the agent brain (LLM loop + tools + channels) for one hosted agent.

Env:
  BRAIN_LLM_BASE_URL / OPENAI_BASE_URL   OpenAI-compatible endpoint (incl. /v1)
  GD_ANTSEED_WORKER_URL                  GoodDollar AntSeed Worker origin
  BRAIN_LLM_API_KEY / OPENAI_API_KEY     Bearer token if required
  BRAIN_MODEL                            Model id (AntSeed: "<peerId>@<model>")
  TELEGRAM_BOT_TOKEN                     Required for the telegram channel
  API_BASE                               GoodAgent API (verify tool)
  BRAIN_MEMORY_DIR                       Session persistence directory`);
      process.exit(0);
    }
  }
  return { manifestPath };
}

async function main(): Promise<void> {
  const logger = createConsoleLogger("brain");
  const { manifestPath } = parseArgs(process.argv.slice(2));
  const config = loadBrainConfig(process.env, manifestPath);

  logger.info("starting", {
    llmBaseUrl: config.llmBaseUrl,
    model: config.model,
    tools: config.toolNames,
    channels: config.channels,
  });

  const llm = createLlmClient({
    baseUrl: config.llmBaseUrl,
    apiKey: config.llmApiKey,
    model: config.model,
    maxTokens: 1024,
  });

  const tools = createBuiltinTools(config.toolNames, {
    apiBase: config.apiBase,
    hostUrl: config.hostUrl,
    deployId: config.deployId,
    hostInternalSecret: config.hostInternalSecret,
    amplifyQueueFile: config.amplifyQueueFile,
    productClankApiKey: config.productClankApiKey,
  });

  const systemPrompt = buildSystemPrompt({
    personaPath: config.personaPath,
    knowledgePaths: config.knowledgePaths,
  });

  const brain = createBrain({
    llm,
    tools,
    systemPrompt,
    memory: createSessionMemory({ persistDir: config.memoryDir }),
    logger,
    // ProductClank attaches 20+ tools; extra rounds make Telegram feel stuck.
    maxToolRounds: config.toolNames.length > 8 ? 2 : undefined,
  });

  const channels: Array<{ stop(): void }> = [];

  if (config.channels.includes("telegram")) {
    if (!config.telegramBotToken) {
      throw new Error("telegram channel enabled but TELEGRAM_BOT_TOKEN is not set");
    }
    const control =
      config.hostUrl && config.deployId && config.hostInternalSecret
        ? createControlClient({
            hostUrl: config.hostUrl,
            deployId: config.deployId,
            secret: config.hostInternalSecret,
          })
        : undefined;
    if (!control) {
      logger.warn(
        "chat control disabled (needs GOODAGENT_HOST_URL, deployId and HOST_INTERNAL_SECRET)",
      );
    }
    const telegram = createTelegramChannel({
      botToken: config.telegramBotToken,
      brain,
      logger: createConsoleLogger("telegram"),
      control,
    });
    telegram.start();
    channels.push(telegram);
  }

  if (channels.length === 0) {
    logger.warn("no channels enabled — brain is idle (add \"telegram\" to brain.channels)");
  }

  const shutdown = (signal: string) => {
    logger.info(`${signal} — stopping`);
    for (const channel of channels) channel.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[brain] fatal", err);
  process.exit(1);
});
