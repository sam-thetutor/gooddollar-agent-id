export {
  createConsoleLogger,
  type AssistantMessage,
  type BrainLogger,
  type BrainTool,
  type ChatMessage,
  type ChatToolCall,
  type LlmClient,
} from "./types.js";

export { createLlmClient, type LlmClientOptions } from "./llm.js";

export {
  createSessionMemory,
  type SessionMemory,
  type SessionMemoryOptions,
} from "./memory.js";

export { buildSystemPrompt, DEFAULT_PERSONA, type PersonaOptions } from "./persona.js";

export { createBrain, type Brain, type BrainOptions } from "./orchestrator.js";

export {
  createBuiltinTools,
  createVerifyAddressTool,
  createCheckClaimEligibilityTool,
  createAgentStatsTool,
  type BuiltinToolOptions,
  type VerifyAddressToolOptions,
  type CheckClaimEligibilityToolOptions,
  type AgentStatsToolOptions,
} from "./tools/index.js";

export {
  createGdAntseedCreditsClient,
  type CreditsProfile,
  type GdAntseedCreditsClient,
  type GdAntseedCreditsClientOptions,
  type RecordCeloEventResult,
} from "./credits.js";

export {
  createTelegramChannel,
  stripMarkdown,
  type TelegramChannel,
  type TelegramChannelOptions,
} from "./channels/telegram.js";

export {
  brainManifestSchema,
  brainManifestFileSchema,
  loadBrainConfig,
  DEFAULT_DEV_LLM_BASE_URL,
  DEFAULT_MODEL,
  type BrainConfig,
  type BrainManifest,
} from "./config.js";
