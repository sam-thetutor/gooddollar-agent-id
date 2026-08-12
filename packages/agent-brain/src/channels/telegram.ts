import type { Brain } from "../orchestrator.js";
import type { BrainLogger } from "../types.js";
import { createConsoleLogger } from "../types.js";

/**
 * Telegram channel adapter: long-polls getUpdates and routes each text
 * message through the brain. Sessions are keyed `tg:<chatId>` so group and
 * private chats keep separate memory.
 *
 * Uses the raw Bot API over fetch (no framework dependency) — consistent
 * with the existing claim-bot scripts in this repo.
 */
export interface TelegramChannelOptions {
  botToken: string;
  brain: Brain;
  logger?: BrainLogger;
  fetchImpl?: typeof fetch;
  /** Long-poll timeout in seconds (Telegram max 50). */
  pollTimeoutSeconds?: number;
  /** Restrict the bot to specific chat ids; empty/undefined = open. */
  allowedChatIds?: number[];
}

export interface TelegramChannel {
  start(): void;
  stop(): void;
}

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; is_bot?: boolean };
  };
}

const MAX_MESSAGE_LENGTH = 4096;

/**
 * Models emit markdown no matter what the persona says; plain sendMessage
 * shows it as literal characters. Strip the common constructs deterministically.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/`{3}[a-z]*\n?([\s\S]*?)`{3}/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "");
}

function chunk(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += MAX_MESSAGE_LENGTH) {
    parts.push(text.slice(i, i + MAX_MESSAGE_LENGTH));
  }
  return parts;
}

export function createTelegramChannel(
  options: TelegramChannelOptions,
): TelegramChannel {
  const logger = options.logger ?? createConsoleLogger("telegram");
  const fetchFn = options.fetchImpl ?? fetch;
  const api = `https://api.telegram.org/bot${options.botToken}`;
  const pollTimeout = options.pollTimeoutSeconds ?? 25;

  let running = false;
  let offset = 0;

  async function call(method: string, body: Record<string, unknown>) {
    const res = await fetchFn(`${api}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: unknown;
      description?: string;
    } | null;
    if (!res.ok || !json?.ok) {
      throw new Error(
        `telegram ${method} failed: ${res.status} ${json?.description ?? ""}`,
      );
    }
    return json.result;
  }

  async function handleUpdate(update: TgUpdate): Promise<void> {
    const msg = update.message;
    if (!msg?.text || msg.from?.is_bot) return;
    const chatId = msg.chat.id;
    if (
      options.allowedChatIds &&
      options.allowedChatIds.length > 0 &&
      !options.allowedChatIds.includes(chatId)
    ) {
      return;
    }

    const sessionId = `tg:${chatId}`;
    const text = msg.text.trim();

    if (text === "/start" || text === "/reset") {
      options.brain.resetSession(sessionId);
      await call("sendMessage", {
        chat_id: chatId,
        text:
          text === "/start"
            ? "Hi! I'm a verified GoodAgent. Ask me anything — I can verify agent addresses and check GoodDollar UBI claim eligibility."
            : "Memory cleared. Fresh start!",
      });
      return;
    }

    await call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(
      () => undefined,
    );

    let reply: string;
    try {
      reply = await options.brain.handleMessage(sessionId, text);
    } catch (err) {
      logger.error("brain error", { error: (err as Error).message });
      reply = "Sorry, something went wrong on my side. Please try again.";
    }

    for (const part of chunk(stripMarkdown(reply))) {
      await call("sendMessage", { chat_id: chatId, text: part });
    }
  }

  async function loop(): Promise<void> {
    logger.info("telegram channel started");
    while (running) {
      try {
        const updates = (await call("getUpdates", {
          offset,
          timeout: pollTimeout,
          allowed_updates: ["message"],
        })) as TgUpdate[];

        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1);
          // Sequential on purpose: keeps per-chat ordering and bounds
          // concurrent inference spend.
          await handleUpdate(update).catch((err) =>
            logger.error("update failed", { error: (err as Error).message }),
          );
        }
      } catch (err) {
        logger.error("poll failed", { error: (err as Error).message });
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    logger.info("telegram channel stopped");
  }

  return {
    start() {
      if (running) return;
      running = true;
      void loop();
    },
    stop() {
      running = false;
    },
  };
}
