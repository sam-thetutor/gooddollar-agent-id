import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatMessage } from "./types.js";

/**
 * Per-session conversation memory. Sessions map 1:1 to a channel conversation
 * (e.g. `tg:<chatId>`). History is trimmed to a bounded number of messages so
 * long chats don't blow up inference cost, and optionally persisted to the
 * agent's `memory/` directory so PM2 restarts don't lose context.
 */
export interface SessionMemoryOptions {
  /** Max non-system messages kept per session (oldest dropped first). */
  maxMessages?: number;
  /** Directory for JSON persistence; omit for in-memory only. */
  persistDir?: string;
}

export interface SessionMemory {
  history(sessionId: string): ChatMessage[];
  append(sessionId: string, message: ChatMessage): void;
  clear(sessionId: string): void;
}

const DEFAULT_MAX_MESSAGES = 40;

function sessionFileName(sessionId: string): string {
  return `${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
}

/**
 * Drop oldest messages beyond the cap, but never leave an orphaned `tool`
 * message at the head (its assistant tool_call context would be gone, which
 * some OpenAI-compatible backends reject).
 */
function trim(messages: ChatMessage[], maxMessages: number): ChatMessage[] {
  let trimmed =
    messages.length <= maxMessages ? messages : messages.slice(messages.length - maxMessages);
  while (trimmed.length > 0 && trimmed[0].role === "tool") {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

export function createSessionMemory(
  options: SessionMemoryOptions = {},
): SessionMemory {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const sessions = new Map<string, ChatMessage[]>();

  const persistDir = options.persistDir;
  if (persistDir && !existsSync(persistDir)) {
    mkdirSync(persistDir, { recursive: true });
  }

  function load(sessionId: string): ChatMessage[] {
    const cached = sessions.get(sessionId);
    if (cached) return cached;
    let messages: ChatMessage[] = [];
    if (persistDir) {
      const file = join(persistDir, sessionFileName(sessionId));
      if (existsSync(file)) {
        try {
          const parsed = JSON.parse(readFileSync(file, "utf8"));
          if (Array.isArray(parsed)) messages = parsed as ChatMessage[];
        } catch {
          // Corrupt session file — start fresh rather than crash the brain.
        }
      }
    }
    sessions.set(sessionId, messages);
    return messages;
  }

  function save(sessionId: string, messages: ChatMessage[]): void {
    if (!persistDir) return;
    const file = join(persistDir, sessionFileName(sessionId));
    writeFileSync(file, JSON.stringify(messages, null, 2));
  }

  return {
    history(sessionId) {
      return [...load(sessionId)];
    },
    append(sessionId, message) {
      const messages = trim([...load(sessionId), message], maxMessages);
      sessions.set(sessionId, messages);
      save(sessionId, messages);
    },
    clear(sessionId) {
      sessions.set(sessionId, []);
      save(sessionId, []);
    },
  };
}
