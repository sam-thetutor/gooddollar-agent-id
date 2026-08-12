import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createVerifyAddressTool } from "./verify-address.js";

const AGENT = "0x1111111111111111111111111111111111111111";

describe("verify_address tool", () => {
  it("calls the verify API and returns the verdict", async () => {
    let requested = "";
    const fetchImpl = (async (url: any) => {
      requested = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ found: true, valid: true, agent: AGENT }),
        text: async () => "",
      } as Response;
    }) as typeof fetch;

    const tool = createVerifyAddressTool({
      apiBase: "https://example.com/api/",
      fetchImpl,
    });
    const result = (await tool.execute({ address: AGENT })) as Record<
      string,
      unknown
    >;

    assert.equal(requested, `https://example.com/api/agent/verify/${AGENT}`);
    assert.equal(result.valid, true);
  });

  it("rejects malformed addresses without hitting the API", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return { ok: true, json: async () => ({}), text: async () => "" } as Response;
    }) as typeof fetch;

    const tool = createVerifyAddressTool({ apiBase: "https://x", fetchImpl });
    const result = (await tool.execute({ address: "not-an-address" })) as {
      error?: string;
    };

    assert.equal(called, false);
    assert.match(result.error ?? "", /Invalid address/);
  });

  it("surfaces API errors as tool results", async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 500,
        text: async () => "boom",
        json: async () => ({}),
      }) as Response) as typeof fetch;

    const tool = createVerifyAddressTool({ apiBase: "https://x", fetchImpl });
    const result = (await tool.execute({ address: AGENT })) as { error?: string };
    assert.match(result.error ?? "", /500/);
  });
});
