/**
 * Core types for the agent brain: the cognitive loop that turns a hosted
 * GoodAgent from a script into an LLM-driven agent (see
 * packages/agent-runtime/REAL_AGENT_ARCHITECTURE.md).
 */

export interface BrainLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * A tool the LLM can invoke. This is the "skill as tool" surface from the
 * architecture doc — on-demand capabilities, as opposed to autonomous
 * plugin skills that run their own loop.
 */
export interface BrainTool {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the tool arguments (OpenAI function-calling format). */
  readonly parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  /** Parsed arguments; `{}` if the model emitted invalid JSON. */
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ChatToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface AssistantMessage {
  role: "assistant";
  content: string | null;
  toolCalls?: ChatToolCall[];
}

/** Minimal LLM client contract; implemented by the OpenAI-compatible client. */
export interface LlmClient {
  chat(messages: ChatMessage[], tools?: BrainTool[]): Promise<AssistantMessage>;
}

export function createConsoleLogger(prefix = "brain"): BrainLogger {
  const fmt = (level: string, message: string, meta?: Record<string, unknown>) =>
    `[${prefix}] ${level} ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`;
  return {
    debug: (m, meta) => console.debug(fmt("debug", m, meta)),
    info: (m, meta) => console.info(fmt("info", m, meta)),
    warn: (m, meta) => console.warn(fmt("warn", m, meta)),
    error: (m, meta) => console.error(fmt("error", m, meta)),
  };
}
