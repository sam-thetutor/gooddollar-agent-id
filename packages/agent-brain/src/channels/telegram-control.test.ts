import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTelegramChannel, parseControlCommand } from "./telegram.js";
import type {
  ClaimLinkResponse,
  ControlAction,
  ControlClient,
  ControlResponse,
} from "../control.js";
import type { Brain } from "../orchestrator.js";

describe("parseControlCommand", () => {
  it("parses slash commands and bare words", () => {
    assert.deepEqual(parseControlCommand("/pause"), {
      kind: "control",
      action: "pause",
    });
    assert.deepEqual(parseControlCommand("pause"), {
      kind: "control",
      action: "pause",
    });
    assert.deepEqual(parseControlCommand("stop"), {
      kind: "control",
      action: "pause",
    });
    assert.deepEqual(parseControlCommand("/resume"), {
      kind: "control",
      action: "resume",
    });
    assert.deepEqual(parseControlCommand("/status"), {
      kind: "control",
      action: "status",
    });
    assert.deepEqual(parseControlCommand("CONFIRM"), { kind: "confirm" });
  });

  it("strips the @botname suffix used in groups", () => {
    assert.deepEqual(parseControlCommand("/pause@my_agent_bot"), {
      kind: "control",
      action: "pause",
    });
  });

  it("parses link tokens from the /start deep link", () => {
    assert.deepEqual(parseControlCommand("/start link_abc123DEF"), {
      kind: "link",
      token: "abc123DEF",
    });
    assert.deepEqual(parseControlCommand("/link abc123"), {
      kind: "link",
      token: "abc123",
    });
  });

  it("does not intercept normal conversation", () => {
    assert.equal(parseControlCommand("please pause for a second"), null);
    assert.equal(parseControlCommand("what's your status today?"), null);
    assert.equal(parseControlCommand("/start"), null);
    assert.equal(parseControlCommand("hello"), null);
  });
});

// ---- channel-level flow ------------------------------------------------------

interface SentMessage {
  chat_id: number;
  text: string;
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: body }),
  } as unknown as Response;
}

/**
 * Drives the channel's long-poll loop with a scripted list of incoming
 * messages and records everything the bot sends back.
 */
async function runScript(
  texts: string[],
  options: { control?: ControlClient; brain?: Brain; fromId?: number },
): Promise<SentMessage[]> {
  const sent: SentMessage[] = [];
  let cursor = 0;
  let done: () => void;
  const finished = new Promise<void>((resolvePromise) => {
    done = resolvePromise;
  });

  const brain: Brain =
    options.brain ??
    ({
      handleMessage: async () => "brain-reply",
      resetSession: () => undefined,
    } as Brain);

  const channel = createTelegramChannel({
    botToken: "test-token",
    brain,
    control: options.control,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const method = String(url).split("/").pop();
      if (method === "getUpdates") {
        if (cursor >= texts.length) {
          channel.stop();
          done!();
          return jsonResponse([]);
        }
        const update = {
          update_id: cursor + 1,
          message: {
            message_id: cursor + 1,
            text: texts[cursor],
            chat: { id: 777, type: "private" },
            from: { id: options.fromId ?? 42, username: "sam" },
          },
        };
        cursor += 1;
        return jsonResponse([update]);
      }
      if (method === "sendMessage") {
        sent.push(JSON.parse(String(init?.body)) as SentMessage);
        return jsonResponse({});
      }
      return jsonResponse({});
    }) as unknown as typeof fetch,
  });

  channel.start();
  await finished;
  return sent;
}

function mockControl() {
  const calls: Array<{ kind: string; args: unknown[] }> = [];
  const client: ControlClient = {
    async claimLink(input) {
      calls.push({ kind: "claimLink", args: [input] });
      return { ok: true, displayName: "Test Agent" } satisfies ClaimLinkResponse;
    },
    async control(action: ControlAction, telegramUserId: number) {
      calls.push({ kind: "control", args: [action, telegramUserId] });
      return {
        ok: true,
        status: action === "pause" ? "paused" : "running",
        displayName: "Test Agent",
        workers: { online: action !== "pause", status: "online", restarts: 2 },
      } satisfies ControlResponse;
    },
  };
  return { client, calls };
}

describe("telegram channel control flow", () => {
  it("requires CONFIRM before pausing, then calls the host", async () => {
    const { client, calls } = mockControl();
    const sent = await runScript(["/pause", "CONFIRM"], { control: client });

    assert.match(sent[0]!.text, /Reply CONFIRM/);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { kind: "control", args: ["pause", 42] });
    assert.match(sent[1]!.text, /Paused/);
  });

  it("resumes without confirmation", async () => {
    const { client, calls } = mockControl();
    const sent = await runScript(["/resume"], { control: client });

    assert.deepEqual(calls[0], { kind: "control", args: ["resume", 42] });
    assert.match(sent[0]!.text, /Resumed/);
  });

  it("claims a link token from the /start deep link", async () => {
    const { client, calls } = mockControl();
    const sent = await runScript(["/start link_tok123"], { control: client });

    assert.equal(calls[0]!.kind, "claimLink");
    assert.deepEqual(calls[0]!.args[0], {
      token: "tok123",
      telegramUserId: 42,
      telegramUsername: "sam",
    });
    assert.match(sent[0]!.text, /Linked!/);
  });

  it("relays host rejection messages verbatim", async () => {
    const client: ControlClient = {
      async claimLink() {
        return { ok: false, error: "LINK_TOKEN_INVALID" };
      },
      async control() {
        return {
          ok: false,
          error: "NOT_OPERATOR",
          message: "Only the linked operator can control this agent.",
        };
      },
    };
    const sent = await runScript(["/status"], { control: client });
    assert.match(sent[0]!.text, /Only the linked operator/);
  });

  it("routes a bare confirm with nothing pending to the brain", async () => {
    const { client, calls } = mockControl();
    const sent = await runScript(["confirm"], { control: client });

    assert.equal(calls.length, 0);
    assert.equal(sent[0]!.text, "brain-reply");
  });

  it("tells users control is unavailable when not configured", async () => {
    const sent = await runScript(["/pause"], {});
    assert.match(sent[0]!.text, /isn't set up/);
  });
});
