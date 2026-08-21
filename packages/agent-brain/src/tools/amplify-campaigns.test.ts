import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createAmplifyAccountTool,
  createAmplifyProductsSearchTool,
  createAmplifyBoostPreviewTool,
  createAmplifyBoostPostTool,
} from "./amplify-campaigns.js";

function mockFetch(
  handlers: Record<string, (init?: RequestInit) => { status: number; body: unknown }>,
): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const key = Object.keys(handlers).find((k) => url.includes(k));
    const handler = key ? handlers[key] : () => ({ status: 404, body: { success: false } });
    const { status, body } = handler(init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }) as unknown as typeof fetch;
}

const ME_LINKED = {
  success: true,
  credits: 500,
  user: { id: "user-1", name: "Alice" },
  agent: { name: "My Agent", x_handle: "myagent" },
};

const ME_UNLINKED = {
  success: true,
  credits: 0,
  agent: { name: "My Agent", x_handle: "myagent" },
};

describe("amplify_account", () => {
  it("returns link status and owner credits", async () => {
    const tool = createAmplifyAccountTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
      }),
    });
    const result = (await tool.execute({})) as {
      linked: boolean;
      ownerCredits: number;
      linkedUserName: string;
    };
    assert.equal(result.linked, true);
    assert.equal(result.ownerCredits, 500);
    assert.equal(result.linkedUserName, "Alice");
  });
});

describe("amplify_products_search", () => {
  it("requires a linked owner account", async () => {
    const tool = createAmplifyProductsSearchTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_UNLINKED }),
      }),
    });
    const result = (await tool.execute({ query: "TipRanks" })) as { error?: string };
    assert.equal(result.error, "account_not_linked");
  });

  it("returns product matches", async () => {
    const tool = createAmplifyProductsSearchTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/products/search": () => ({
          status: 200,
          body: {
            success: true,
            products: [{ id: "prod-1", name: "TipRanks", tagline: "Research" }],
          },
        }),
      }),
    });
    const result = (await tool.execute({ query: "TipRanks" })) as {
      products: Array<{ productId: string }>;
    };
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].productId, "prod-1");
  });
});

describe("amplify_boost_preview", () => {
  it("shows cost and affordability", async () => {
    const tool = createAmplifyBoostPreviewTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
      }),
    });
    const result = (await tool.execute({
      postUrl: "https://x.com/user/status/1",
      actionType: "replies",
    })) as { creditsRequired: number; canAfford: boolean };
    assert.equal(result.creditsRequired, 200);
    assert.equal(result.canAfford, true);
  });

  it("reports insufficient credits", async () => {
    const tool = createAmplifyBoostPreviewTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({
          status: 200,
          body: { ...ME_LINKED, credits: 50 },
        }),
      }),
    });
    const result = (await tool.execute({
      postUrl: "https://x.com/user/status/1",
      actionType: "replies",
    })) as { canAfford: boolean };
    assert.equal(result.canAfford, false);
  });
});

describe("amplify_boost_post", () => {
  it("requires confirmed=true", async () => {
    const tool = createAmplifyBoostPostTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
      }),
    });
    const result = (await tool.execute({
      postUrl: "https://x.com/user/status/1",
      confirmed: false,
    })) as { error?: string };
    assert.equal(result.error, "confirmation_required");
  });

  it("executes boost when confirmed and linked", async () => {
    const tool = createAmplifyBoostPostTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns/boost": () => ({
          status: 200,
          body: {
            success: true,
            campaign: {
              id: "camp-1",
              campaign_number: "CP-100",
              platform: "twitter",
              url: "https://app.productclank.com/communiply/camp-1",
            },
            items_generated: 10,
            credits: { credits_used: 200, credits_remaining: 300 },
          },
        }),
      }),
    });
    const result = (await tool.execute({
      postUrl: "https://x.com/user/status/1",
      actionType: "replies",
      confirmed: true,
    })) as { ok?: boolean; creditsRemaining?: number };
    assert.equal(result.ok, true);
    assert.equal(result.creditsRemaining, 300);
  });
});
