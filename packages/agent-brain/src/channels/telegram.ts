import type { Brain } from "../orchestrator.js";
import type { ControlAction, ControlClient } from "../control.js";
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
  /**
   * Enables operator commands (/pause, /resume, /status) and the one-time
   * `/start link_<token>` account linking. Authorization happens host-side.
   */
  control?: ControlClient;
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
    from?: { id: number; is_bot?: boolean; username?: string };
  };
}

const MAX_MESSAGE_LENGTH = 4096;
const CONFIRM_TTL_MS = 2 * 60 * 1000;

export type ParsedControlCommand =
  | { kind: "link"; token: string }
  | { kind: "control"; action: ControlAction }
  | { kind: "confirm" };

/**
 * Deterministic operator commands, parsed before anything reaches the LLM.
 * Slash commands are canonical; a couple of bare words are accepted because
 * people type them naturally. Anything else flows to the brain as usual.
 */
export function parseControlCommand(text: string): ParsedControlCommand | null {
  const trimmed = text.trim();
  const link =
    /^\/start[ _]link_([A-Za-z0-9-]+)$/.exec(trimmed) ??
    /^\/link[\s_]+([A-Za-z0-9-]+)$/.exec(trimmed);
  if (link) return { kind: "link", token: link[1]! };

  // Strip the @botname suffix Telegram appends in groups.
  const cmd = trimmed.replace(/^(\/[a-z]+)@\S+$/i, "$1").toLowerCase();
  if (cmd === "/pause" || cmd === "pause" || cmd === "stop") {
    return { kind: "control", action: "pause" };
  }
  if (cmd === "/resume" || cmd === "resume") {
    return { kind: "control", action: "resume" };
  }
  if (cmd === "/status") return { kind: "control", action: "status" };
  if (cmd === "confirm") return { kind: "confirm" };
  return null;
}

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
  const pendingConfirm = new Map<
    number,
    { action: ControlAction; requesterId: number; expiresAt: number }
  >();

  function formatControlResult(
    action: ControlAction,
    res: Awaited<ReturnType<ControlClient["control"]>>,
  ): string {
    if (!res.ok) {
      if (res.error === "NOT_OPERATOR" || res.error === "NOT_LINKED") {
        return (
          res.message ??
          "Only the linked operator can control this agent. Link your Telegram from the agent dashboard."
        );
      }
      return `Couldn't ${action} the agent: ${res.message ?? res.error ?? "unknown error"}`;
    }
    if (action === "status") {
      const w = res.workers;
      const workerLine = w
        ? `Workers: ${w.online ? "online" : w.status ?? "stopped"}${
            w.restarts != null ? ` (${w.restarts} restarts)` : ""
          }`
        : "Workers: not provisioned";
      return `${res.displayName ?? "Agent"} — status: ${res.status ?? "unknown"}\n${workerLine}\nBrain: online (that's me).`;
    }
    if (action === "pause") {
      return "Paused. The agent's workers are stopped; I stay online so you can /resume or check /status anytime.";
    }
    return `Resumed — workers ${res.result === "restarted" ? "restarted" : "starting up"}. Send /status to check on them.`;
  }

  async function handleControlCommand(
    cmd: ParsedControlCommand,
    chatId: number,
    from: { id: number; username?: string },
  ): Promise<string> {
    const control = options.control;
    if (!control) {
      return "Chat control isn't set up for this agent yet.";
    }

    if (cmd.kind === "link") {
      const res = await control.claimLink({
        token: cmd.token,
        telegramUserId: from.id,
        telegramUsername: from.username,
      });
      return res.ok
        ? `Linked! You now control ${res.displayName ?? "this agent"} from this chat — try /status, /pause, /resume.`
        : res.message ??
            "Linking failed — generate a fresh link from the agent dashboard.";
    }

    if (cmd.kind === "confirm") {
      const pending = pendingConfirm.get(chatId);
      pendingConfirm.delete(chatId);
      if (!pending || pending.expiresAt <= Date.now()) {
        return "Nothing to confirm — that request expired. Send /pause again if you still want to stop the agent.";
      }
      if (pending.requesterId !== from.id) {
        return "Only the person who requested the pause can confirm it.";
      }
      const res = await control.control(pending.action, from.id);
      return formatControlResult(pending.action, res);
    }

    if (cmd.action === "pause") {
      pendingConfirm.set(chatId, {
        action: "pause",
        requesterId: from.id,
        expiresAt: Date.now() + CONFIRM_TTL_MS,
      });
      return "This stops the agent's workers (games, campaigns, reminders). I stay online for chat. Reply CONFIRM within 2 minutes to pause.";
    }

    const res = await control.control(cmd.action, from.id);
    return formatControlResult(cmd.action, res);
  }

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

    // Operator control commands never reach the LLM: deterministic parsing,
    // host-side authorization, explicit confirmation for destructive actions.
    const controlCmd = parseControlCommand(text);
    if (
      controlCmd &&
      msg.from?.id != null &&
      // A bare "confirm" with nothing pending is normal conversation.
      !(controlCmd.kind === "confirm" && !pendingConfirm.has(chatId))
    ) {
      let reply: string;
      try {
        reply = await handleControlCommand(controlCmd, chatId, msg.from);
      } catch (err) {
        logger.error("control command failed", { error: (err as Error).message });
        reply = "Sorry — I couldn't reach the control service. Please try again.";
      }
      await call("sendMessage", { chat_id: chatId, text: reply });
      return;
    }

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
