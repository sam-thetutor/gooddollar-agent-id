import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBrain } from "./orchestrator.js";
import { createSessionMemory } from "./memory.js";
import type {
  AssistantMessage,
  BrainTool,
  ChatMessage,
  LlmClient,
} from "./types.js";

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function scriptedLlm(responses: AssistantMessage[]): LlmClient & {
  calls: ChatMessage[][];
} {
  const calls: ChatMessage[][] = [];
  let i = 0;
  return {
    calls,
    async chat(messages) {
      calls.push(messages);
      const reply = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return reply;
    },
  };
}

const echoTool: BrainTool = {
  name: "echo",
  description: "Echoes its input.",
  parameters: { type: "object", properties: { text: { type: "string" } } },
  async execute(args) {
    return { echoed: args.text };
  },
};

describe("createBrain", () => {
  it("returns a plain answer when the model does not call tools", async () => {
    const llm = scriptedLlm([{ role: "assistant", content: "hello!" }]);
    const brain = createBrain({
      llm,
      systemPrompt: "sys",
      tools: [echoTool],
      logger: silentLogger,
    });

    const reply = await brain.handleMessage("s1", "hi");
    assert.equal(reply, "hello!");
    // System prompt goes first, then the user message.
    assert.equal(llm.calls[0][0].role, "system");
    assert.deepEqual(llm.calls[0][1], { role: "user", content: "hi" });
  });

  it("executes tool calls and feeds results back to the model", async () => {
    const llm = scriptedLlm([
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "c1", name: "echo", arguments: { text: "ping" } }],
      },
      { role: "assistant", content: "the tool said ping" },
    ]);
    const brain = createBrain({
      llm,
      systemPrompt: "sys",
      tools: [echoTool],
      logger: silentLogger,
    });

    const reply = await brain.handleMessage("s1", "use the tool");
    assert.equal(reply, "the tool said ping");

    // Second round must include the assistant tool-call message and the tool result.
    const second = llm.calls[1];
    const toolMsg = second.find((m) => m.role === "tool");
    assert.ok(toolMsg);
    assert.match((toolMsg as { content: string }).content, /ping/);
  });

  it("reports unknown tools back to the model instead of crashing", async () => {
    const llm = scriptedLlm([
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "c1", name: "nope", arguments: {} }],
      },
      { role: "assistant", content: "recovered" },
    ]);
    const brain = createBrain({
      llm,
      systemPrompt: "sys",
      tools: [echoTool],
      logger: silentLogger,
    });

    const reply = await brain.handleMessage("s1", "call a bad tool");
    assert.equal(reply, "recovered");
    const toolMsg = llm.calls[1].find((m) => m.role === "tool");
    assert.match((toolMsg as { content: string }).content, /Unknown tool/);
  });

  it("stops after maxToolRounds and returns a fallback", async () => {
    const llm = scriptedLlm([
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "c1", name: "echo", arguments: { text: "loop" } }],
      },
    ]);
    const brain = createBrain({
      llm,
      systemPrompt: "sys",
      tools: [echoTool],
      maxToolRounds: 2,
      logger: silentLogger,
    });

    const reply = await brain.handleMessage("s1", "loop forever");
    assert.match(reply, /couldn't finish/);
    assert.equal(llm.calls.length, 2);
  });

  it("falls back when the model returns an empty message", async () => {
    const llm = scriptedLlm([{ role: "assistant", content: "" }]);
    const brain = createBrain({
      llm,
      systemPrompt: "sys",
      logger: silentLogger,
    });

    const reply = await brain.handleMessage("s1", "hello?");
    assert.match(reply, /couldn't finish/);
  });

  it("keeps separate memory per session", async () => {
    const memory = createSessionMemory();
    const llm = scriptedLlm([{ role: "assistant", content: "ok" }]);
    const brain = createBrain({
      llm,
      systemPrompt: "sys",
      memory,
      logger: silentLogger,
    });

    await brain.handleMessage("a", "first");
    await brain.handleMessage("b", "second");

    assert.equal(memory.history("a").length, 2); // user + assistant
    assert.equal(memory.history("b").length, 2);
    assert.deepEqual(memory.history("a")[0], { role: "user", content: "first" });
  });
});
