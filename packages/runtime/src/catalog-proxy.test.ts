import { describe, expect, it } from "vitest";
import { catalogProxyConfigured, proxyCatalogRequest } from "./catalog-proxy.js";

describe("catalogProxyConfigured", () => {
  it("requires both url and secret", () => {
    expect(catalogProxyConfigured("", "s")).toBe(false);
    expect(catalogProxyConfigured("http://127.0.0.1:3000", "")).toBe(false);
    expect(catalogProxyConfigured("http://127.0.0.1:3000", "s")).toBe(true);
  });
});

describe("proxyCatalogRequest", () => {
  it("forwards Bearer auth and JSON body", async () => {
    let seen: { url?: string; init?: RequestInit } = {};
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      seen = { url: String(url), init };
      return {
        status: 200,
        json: async () => ({ picks: [] }),
      } as Response;
    }) as typeof fetch;

    const result = await proxyCatalogRequest({
      catalogUrl: "http://127.0.0.1:3000/",
      catalogSecret: "cat-secret",
      path: "/recommend",
      method: "POST",
      body: { count: 3 },
      fetchImpl,
    });

    expect(result.status).toBe(200);
    expect(seen.url).toBe("http://127.0.0.1:3000/internal/catalog/recommend");
    expect(seen.init?.headers).toMatchObject({
      authorization: "Bearer cat-secret",
    });
    expect(seen.init?.body).toBe(JSON.stringify({ count: 3 }));
  });

  it("maps network failure to 502", async () => {
    const fetchImpl = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch;
    const result = await proxyCatalogRequest({
      catalogUrl: "http://127.0.0.1:3000",
      catalogSecret: "s",
      path: "/fixtures",
      method: "GET",
      fetchImpl,
    });
    expect(result.status).toBe(502);
    expect((result.body as { error: string }).error).toBe("CATALOG_UNREACHABLE");
  });
});
