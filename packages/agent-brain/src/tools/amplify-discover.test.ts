import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createAmplifyMyCampaignsTool,
  createAmplifyDiscoverPreviewTool,
  createAmplifyDiscoverCreateTool,
  createAmplifyDiscoverResearchTool,
} from "./amplify-discover.js";

const ME_LINKED = {
  success: true,
  credits: 500,
  user: { id: "user-1", name: "Alice" },
  agent: { name: "Agent", x_handle: "myagent" },
};

function mockFetch(
  handlers: Record<string, () => { status: number; body: unknown }>,
): typeof fetch {
  return (async (input: string | URL) => {
    const url = String(input);
    const key = Object.keys(handlers).find((k) => url.includes(k));
    const handler = key ? handlers[key] : () => ({ status: 404, body: { success: false } });
    const { status, body } = handler();
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }) as unknown as typeof fetch;
}

describe("amplify_my_campaigns", () => {
  it("lists agent campaigns", async () => {
    const tool = createAmplifyMyCampaignsTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns": () => ({
          status: 200,
          body: {
            success: true,
            total: 1,
            campaigns: [
              {
                id: "camp-1",
                campaign_number: "CP-042",
                title: "Launch",
                status: "active",
                admin_url: "https://app.productclank.com/admin/1",
              },
            ],
          },
        }),
      }),
    });
    const result = (await tool.execute({})) as {
      campaigns: Array<{ number: string }>;
    };
    assert.equal(result.campaigns.length, 1);
    assert.equal(result.campaigns[0].number, "CP-042");
  });
});

describe("amplify_discover_preview", () => {
  it("shows 10 credit create cost", async () => {
    const tool = createAmplifyDiscoverPreviewTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
      }),
    });
    const result = (await tool.execute({
      productId: "prod-1",
      title: "AI tools buzz",
      keywords: "AI, productivity",
    })) as { creditsRequired: number; canAfford: boolean };
    assert.equal(result.creditsRequired, 10);
    assert.equal(result.canAfford, true);
  });
});

describe("amplify_discover_create", () => {
  it("requires confirmation", async () => {
    const tool = createAmplifyDiscoverCreateTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
      }),
    });
    const result = (await tool.execute({
      productId: "prod-1",
      title: "Test",
      keywords: "AI",
      searchContext: "builders discussing AI",
      confirmed: false,
    })) as { error?: string };
    assert.equal(result.error, "confirmation_required");
  });

  it("creates campaign when confirmed", async () => {
    const tool = createAmplifyDiscoverCreateTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns": () => ({
          status: 200,
          body: {
            success: true,
            campaign: {
              id: "camp-new",
              campaign_number: "CP-099",
              title: "Test",
              admin_url: "https://app.productclank.com/admin/new",
            },
            credits: { credits_used: 10, credits_remaining: 490 },
          },
        }),
      }),
    });
    const result = (await tool.execute({
      productId: "prod-1",
      title: "Test",
      keywords: "AI, tools",
      searchContext: "builders discussing AI",
      confirmed: true,
    })) as { ok?: boolean; campaign: { number: string } };
    assert.equal(result.ok, true);
    assert.equal(result.campaign.number, "CP-099");
  });
});

describe("amplify_discover_research", () => {
  it("runs free research", async () => {
    const tool = createAmplifyDiscoverResearchTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns?": () => ({
          status: 200,
          body: {
            success: true,
            campaigns: [{ id: "camp-1", campaign_number: "CP-042", title: "Launch" }],
          },
        }),
        "/research": () => ({
          status: 200,
          body: {
            success: true,
            research: { expanded_keywords: ["AI agents", "automation"] },
          },
        }),
      }),
    });
    const result = (await tool.execute({ campaignId: "CP-042" })) as {
      ok?: boolean;
      creditsUsed: number;
    };
    assert.equal(result.ok, true);
    assert.equal(result.creditsUsed, 0);
  });
});
