import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createAmplifyContentPreviewTool,
  createAmplifyContentLaunchTool,
} from "./amplify-content.js";

const ME_LINKED = {
  success: true,
  credits: 1500,
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

describe("amplify_content_preview", () => {
  it("returns proposal and 1000 credit cost", async () => {
    const tool = createAmplifyContentPreviewTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns/content": () => ({
          status: 200,
          body: {
            success: true,
            proposal: { title: "UGC brief" },
            credits_required: 1000,
            credits_available: 1500,
            can_afford: true,
          },
        }),
      }),
    });
    const result = (await tool.execute({
      productId: "prod-1",
      campaignMessage: "Create a 30s demo video",
    })) as { creditsRequired: number; canAfford: boolean; dryRun: boolean };
    assert.equal(result.dryRun, true);
    assert.equal(result.creditsRequired, 1000);
    assert.equal(result.canAfford, true);
  });

  it("requires linked owner", async () => {
    const tool = createAmplifyContentPreviewTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({
          status: 200,
          body: { success: true, credits: 0, user: null },
        }),
      }),
    });
    const result = (await tool.execute({
      productId: "prod-1",
      campaignMessage: "Brief",
    })) as { error: string };
    assert.equal(result.error, "account_not_linked");
  });
});

describe("amplify_content_launch", () => {
  it("requires confirmed=true", async () => {
    const tool = createAmplifyContentLaunchTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
      }),
    });
    const result = (await tool.execute({
      productId: "prod-1",
      campaignMessage: "Brief",
      confirmed: false,
    })) as { error: string };
    assert.equal(result.error, "confirmation_required");
  });

  it("launches when owner has credits", async () => {
    const tool = createAmplifyContentLaunchTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns/content": () => ({
          status: 200,
          body: {
            success: true,
            campaign: {
              id: "camp-ugc",
              campaign_number: "CP-100",
              title: "UGC",
              status: "active",
              admin_url: "https://app.productclank.com/admin/ugc",
            },
            credits: { credits_used: 1000, credits_remaining: 500 },
          },
        }),
      }),
    });
    const result = (await tool.execute({
      productId: "prod-1",
      campaignMessage: "Brief",
      confirmed: true,
    })) as { ok: boolean; campaign: { campaignId: string } };
    assert.equal(result.ok, true);
    assert.equal(result.campaign.campaignId, "camp-ugc");
  });
});
