import type {
  BrainLogger,
  BrainTool,
  ChatMessage,
  LlmClient,
} from "./types.js";
import type { SessionMemory } from "./memory.js";
import { createSessionMemory } from "./memory.js";
import { createConsoleLogger } from "./types.js";

/**
 * The agent loop: user message → LLM (with tools) → execute tool calls →
 * feed results back → final answer. Tool rounds are bounded so a confused
 * model can't spin credits forever.
 */
export interface BrainOptions {
  llm: LlmClient;
  systemPrompt: string;
  tools?: BrainTool[];
  memory?: SessionMemory;
  logger?: BrainLogger;
  /** Max LLM round-trips per user message (each may carry tool calls). */
  maxToolRounds?: number;
}

export interface Brain {
  handleMessage(sessionId: string, userText: string): Promise<string>;
  resetSession(sessionId: string): void;
}

const DEFAULT_MAX_TOOL_ROUNDS = 4;
const FALLBACK_REPLY =
  "Sorry — I couldn't finish working on that. Please try again.";

function serializeToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

export function createBrain(options: BrainOptions): Brain {
  const tools = options.tools ?? [];
  const memory = options.memory ?? createSessionMemory();
  const logger = options.logger ?? createConsoleLogger();
  const maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  async function executeTool(name: string, args: Record<string, unknown>) {
    const tool = toolsByName.get(name);
    if (!tool) {
      logger.warn("unknown tool requested", { tool: name });
      return { error: `Unknown tool: ${name}` };
    }
    try {
      return await tool.execute(args);
    } catch (err) {
      logger.error("tool failed", { tool: name, error: (err as Error).message });
      return { error: `Tool ${name} failed: ${(err as Error).message}` };
    }
  }

  return {
    async handleMessage(sessionId, userText) {
      memory.append(sessionId, { role: "user", content: userText });

      for (let round = 0; round < maxToolRounds; round += 1) {
        const messages: ChatMessage[] = [
          { role: "system", content: options.systemPrompt },
          ...memory.history(sessionId),
        ];
        const reply = await options.llm.chat(messages, tools);

        if (!reply.toolCalls || reply.toolCalls.length === 0) {
          // Some models occasionally emit an empty message; never forward
          // empty text to channels (Telegram rejects empty sendMessage).
          const content = reply.content?.trim() ? reply.content : FALLBACK_REPLY;
          memory.append(sessionId, { role: "assistant", content });
          return content;
        }

        memory.append(sessionId, {
          role: "assistant",
          content: reply.content,
          toolCalls: reply.toolCalls,
        });

        for (const call of reply.toolCalls) {
          logger.info("tool call", { tool: call.name, session: sessionId });
          const result = await executeTool(call.name, call.arguments);
          memory.append(sessionId, {
            role: "tool",
            toolCallId: call.id,
            content: serializeToolResult(result),
          });
        }
      }

      logger.warn("max tool rounds exceeded", { session: sessionId });
      memory.append(sessionId, { role: "assistant", content: FALLBACK_REPLY });
      return FALLBACK_REPLY;
    },
    resetSession(sessionId) {
      memory.clear(sessionId);
    },
  };
}
