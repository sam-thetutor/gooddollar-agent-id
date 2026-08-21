import type {
  AssistantMessage,
  ChatMessage,
  ChatToolCall,
  LlmClient,
} from "./types.js";

/**
 * OpenAI-compatible chat-completions client.
 *
 * The same client talks to every inference backend in the architecture:
 * - GoodDollar AntSeed Worker proxy (production, G$ credits) — set `baseUrl`
 *   to the Worker origin once its `/v1/chat/completions` proxy is live.
 * - Raw AntSeed buyer proxy `http://localhost:8377/v1` (dev only).
 * - Any OpenAI-compatible endpoint (fallback / local testing).
 *
 * AntSeed model routing uses `"<peerId>@<model>"` in the model field, which
 * passes through unchanged.
 */
export interface LlmClientOptions {
  /** Base URL up to and including `/v1`, e.g. `http://localhost:8377/v1`. */
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface WireToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface WireMessage {
  role: string;
  content: string | null;
  tool_calls?: WireToolCall[];
}

function toWireMessage(msg: ChatMessage): Record<string, unknown> {
  switch (msg.role) {
    case "system":
    case "user":
      return { role: msg.role, content: msg.content };
    case "assistant": {
      const wire: Record<string, unknown> = {
        role: "assistant",
        content: msg.content,
      };
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        wire.tool_calls = msg.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments),
          },
        }));
      }
      return wire;
    }
    case "tool":
      return {
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: msg.content,
      };
  }
}

function parseToolCalls(raw: WireToolCall[] | undefined): ChatToolCall[] {
  if (!raw) return [];
  const calls: ChatToolCall[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const call = raw[i];
    const name = call.function?.name;
    if (!name) continue;
    let args: Record<string, unknown> = {};
    if (call.function?.arguments) {
      try {
        const parsed = JSON.parse(call.function.arguments);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        // Model emitted invalid JSON — surface an empty args object so the
        // tool can respond with a validation error instead of crashing.
      }
    }
    calls.push({ id: call.id ?? `call_${i}`, name, arguments: args });
  }
  return calls;
}

export function createLlmClient(options: LlmClientOptions): LlmClient {
  const base = options.baseUrl.replace(/\/$/, "");
  const fetchFn = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000;

  return {
    async chat(messages, tools): Promise<AssistantMessage> {
      const body: Record<string, unknown> = {
        model: options.model,
        messages: messages.map(toWireMessage),
      };
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (tools && tools.length > 0) {
        body.tools = tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }));
      }

      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchFn(`${base}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`llm request failed: ${res.status} ${text.slice(0, 500)}`);
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: WireMessage }>;
      };
      const message = json.choices?.[0]?.message;
      if (!message) {
        throw new Error("llm response missing choices[0].message");
      }

      const toolCalls = parseToolCalls(message.tool_calls);
      return {
        role: "assistant",
        content: message.content ?? null,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    },
  };
}
