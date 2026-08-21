import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGdAntseedCreditsClient } from "./credits.js";

function fakeFetch(response: unknown) {
  const capture: { url?: string; method?: string; body?: unknown } = {};
  const fn = (async (url: any, init: any) => {
    capture.url = String(url);
    capture.method = init?.method ?? "GET";
    capture.body = init?.body ? JSON.parse(init.body) : undefined;
    return {
      ok: true,
      status: 200,
      json: async () => response,
      text: async () => JSON.stringify(response),
    } as Response;
  }) as typeof fetch;
  return { fn, capture };
}

const BUYER = "0x2222222222222222222222222222222222222222";

describe("createGdAntseedCreditsClient", () => {
  it("fetches the buyer profile", async () => {
    const { fn, capture } = fakeFetch({ buyer: BUYER, credits: "1500" });
    const client = createGdAntseedCreditsClient({
      workerUrl: "https://worker.example.com/",
      fetchImpl: fn,
    });

    const profile = await client.getProfile(BUYER);
    assert.equal(
      capture.url,
      `https://worker.example.com/v1/accounts/${BUYER}/profile`,
    );
    assert.equal(profile.credits, "1500");
  });

  it("records a Celo deposit tx", async () => {
    const txHash = `0x${"ab".repeat(32)}`;
    const { fn, capture } = fakeFetch({ txHash, creditsIssued: "1000" });
    const client = createGdAntseedCreditsClient({
      workerUrl: "https://worker.example.com",
      fetchImpl: fn,
    });

    const result = await client.recordCeloEvent(txHash);
    assert.equal(capture.url, "https://worker.example.com/v1/celo/events/record");
    assert.equal(capture.method, "POST");
    assert.deepEqual(capture.body, { txHash });
    assert.equal(result.txHash, txHash);
  });

  it("throws with worker error details on failure", async () => {
    const fn = (async () =>
      ({
        ok: false,
        status: 400,
        text: async () => "unknown tx",
        json: async () => ({}),
      }) as Response) as typeof fetch;
    const client = createGdAntseedCreditsClient({
      workerUrl: "https://worker.example.com",
      fetchImpl: fn,
    });

    await assert.rejects(
      () => client.recordCeloEvent(`0x${"00".repeat(32)}`),
      /400.*unknown tx/s,
    );
  });
});
