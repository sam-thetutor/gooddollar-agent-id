import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLlmClient } from "./llm.js";
import type { BrainTool } from "./types.js";

function fakeFetch(response: unknown, capture: { url?: string; body?: any } = {}) {
  const fn = (async (url: any, init: any) => {
    capture.url = String(url);
    capture.body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => response,
      text: async () => JSON.stringify(response),
    } as Response;
  }) as typeof fetch;
  return { fn, capture };
}

const tool: BrainTool = {
  name: "verify_address",
  description: "verify",
  parameters: { type: "object", properties: {} },
  async execute() {
    return {};
  },
};

describe("createLlmClient", () => {
  it("sends OpenAI-format requests with tools", async () => {
    const { fn, capture } = fakeFetch({
      choices: [{ message: { role: "assistant", content: "hi" } }],
    });
    const llm = createLlmClient({
      baseUrl: "http://localhost:8377/v1/",
      model: "peer1@deepseek-v4-flash",
      apiKey: "k",
      fetchImpl: fn,
    });

    const reply = await llm.chat([{ role: "user", content: "hello" }], [tool]);

    assert.equal(capture.url, "http://localhost:8377/v1/chat/completions");
    assert.equal(capture.body.model, "peer1@deepseek-v4-flash");
    assert.equal(capture.body.tools[0].function.name, "verify_address");
    assert.equal(reply.content, "hi");
    assert.equal(reply.toolCalls, undefined);
  });

  it("parses tool calls with JSON arguments", async () => {
    const { fn } = fakeFetch({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "c1",
                function: {
                  name: "verify_address",
                  arguments: '{"address":"0xabc"}',
                },
              },
            ],
          },
        },
      ],
    });
    const llm = createLlmClient({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: fn,
    });

    const reply = await llm.chat([{ role: "user", content: "verify 0xabc" }]);
    assert.equal(reply.toolCalls?.length, 1);
    assert.deepEqual(reply.toolCalls?.[0].arguments, { address: "0xabc" });
  });

  it("degrades invalid tool-call JSON to empty args", async () => {
    const { fn } = fakeFetch({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "c1", function: { name: "verify_address", arguments: "{oops" } },
            ],
          },
        },
      ],
    });
    const llm = createLlmClient({ baseUrl: "http://x/v1", model: "m", fetchImpl: fn });

    const reply = await llm.chat([{ role: "user", content: "x" }]);
    assert.deepEqual(reply.toolCalls?.[0].arguments, {});
  });

  it("throws on non-2xx responses", async () => {
    const fn = (async () =>
      ({
        ok: false,
        status: 402,
        text: async () => "insufficient credits",
        json: async () => ({}),
      }) as Response) as typeof fetch;
    const llm = createLlmClient({ baseUrl: "http://x/v1", model: "m", fetchImpl: fn });

    await assert.rejects(
      () => llm.chat([{ role: "user", content: "x" }]),
      /402.*insufficient credits/s,
    );
  });
});
