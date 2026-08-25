import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createBookSelectionsTool,
  createRecommendMatchesTool,
  createSearchFixturesTool,
} from "./kasuku.js";

function mockFetch(status: number, body: unknown, capture?: { url?: string; headers?: unknown }): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    if (capture) {
      capture.url = String(url);
      capture.headers = init?.headers;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
}

describe("kasuku catalog tools", () => {
  it("search_fixtures hits the host catalog with the host secret", async () => {
    const capture: { url?: string; headers?: unknown } = {};
    const tool = createSearchFixturesTool({
      hostUrl: "http://127.0.0.1:3010/",
      hostInternalSecret: "host-secret",
      fetchImpl: mockFetch(200, { fixtures: [], count: 0 }, capture),
    });
    const result = await tool.execute({ query: "Vipers", dateFrom: "2026-08-24" });
    assert.equal(
      capture.url,
      "http://127.0.0.1:3010/internal/catalog/fixtures?query=Vipers&dateFrom=2026-08-24",
    );
    assert.deepEqual(capture.headers, { "x-host-secret": "host-secret" });
    assert.deepEqual(result, { fixtures: [], count: 0 });
  });

  it("normalizes dateFrom=today to an ISO day", async () => {
    const capture: { url?: string } = {};
    const tool = createSearchFixturesTool({
      hostUrl: "http://127.0.0.1:3010",
      hostInternalSecret: "s",
      fetchImpl: mockFetch(200, { fixtures: [], count: 0 }, capture),
    });
    await tool.execute({ dateFrom: "today" });
    const day = new Date().toISOString().slice(0, 10);
    assert.match(capture.url ?? "", new RegExp(`dateFrom=${day}`));
  });

  it("recommend_matches surfaces catalog errors without throwing", async () => {
    const tool = createRecommendMatchesTool({
      hostUrl: "http://127.0.0.1:3010",
      hostInternalSecret: "s",
      fetchImpl: mockFetch(503, { error: "CATALOG_UNAVAILABLE" }),
    });
    const result = (await tool.execute({})) as { error: string };
    assert.equal(result.error, "CATALOG_UNAVAILABLE");
  });

  it("book_selections posts selections to the host catalog", async () => {
    const capture: { url?: string; headers?: unknown; body?: string } = {};
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      capture.url = String(url);
      capture.headers = init?.headers;
      capture.body = typeof init?.body === "string" ? init.body : undefined;
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: "ABC12", shareUrl: "https://example/s/ABC12" }),
      } as Response;
    }) as typeof fetch;
    const tool = createBookSelectionsTool({
      hostUrl: "http://127.0.0.1:3010",
      hostInternalSecret: "s",
      fetchImpl,
    });
    const result = (await tool.execute({
      bookmaker: "betpawa",
      selections: [{ homeTeam: "A", awayTeam: "B", market: "1X2", pick: "home", odds: 1.8 }],
    })) as { code: string };
    assert.equal(capture.url, "http://127.0.0.1:3010/internal/catalog/book");
    assert.equal(result.code, "ABC12");
    assert.match(capture.body ?? "", /betpawa/);
  });
});
