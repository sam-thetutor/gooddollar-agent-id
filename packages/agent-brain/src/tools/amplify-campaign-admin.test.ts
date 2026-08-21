import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createAmplifyCreditsHistoryTool,
  createAmplifyCampaignDelegateTool,
  createAmplifyDiscoverRegeneratePreviewTool,
  createAmplifyDiscoverRegenerateTool,
  createAmplifyDiscoverReviewPreviewTool,
  createAmplifyDiscoverReviewTool,
} from "./amplify-campaign-admin.js";

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

describe("amplify_credits_history", () => {
  it("returns recent transactions", async () => {
    const tool = createAmplifyCreditsHistoryTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/credits/history": () => ({
          status: 200,
          body: {
            success: true,
            total: 1,
            transactions: [
              {
                type: "debit",
                amount: -10,
                balance_after: 490,
                operation_type: "discover_create",
                description: "Discover campaign",
                created_at: "2026-08-20T10:00:00Z",
              },
            ],
          },
        }),
      }),
    });
    const result = (await tool.execute({ limit: 5 })) as {
      transactions: Array<{ amount: number }>;
    };
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].amount, -10);
  });
});

describe("amplify_campaign_delegate", () => {
  it("adds a delegator after confirmation", async () => {
    const tool = createAmplifyCampaignDelegateTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns?limit=100": () => ({
          status: 200,
          body: {
            success: true,
            campaigns: [{ id: "camp-1", campaign_number: "CP-042" }],
          },
        }),
        "/agents/campaigns/camp-1/delegates": () => ({
          status: 200,
          body: { success: true, message: "Delegator added" },
        }),
      }),
    });
    const result = (await tool.execute({
      campaignId: "CP-042",
      userId: "user-2",
      confirmed: true,
    })) as { ok: boolean };
    assert.equal(result.ok, true);
  });
});

describe("amplify_discover_regenerate_preview", () => {
  it("computes 5 credits per post", async () => {
    const tool = createAmplifyDiscoverRegeneratePreviewTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns?limit=100": () => ({
          status: 200,
          body: {
            success: true,
            campaigns: [{ id: "camp-1", campaign_number: "CP-042" }],
          },
        }),
      }),
    });
    const result = (await tool.execute({
      campaignId: "CP-042",
      postIds: "post-a, post-b",
    })) as { creditsRequired: number; canAfford: boolean };
    assert.equal(result.creditsRequired, 10);
    assert.equal(result.canAfford, true);
  });
});

describe("amplify_discover_regenerate", () => {
  it("requires confirmed=true", async () => {
    const tool = createAmplifyDiscoverRegenerateTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
      }),
    });
    const result = (await tool.execute({
      campaignId: "camp-1",
      postIds: "post-a",
      editRequest: "shorter",
      confirmed: false,
    })) as { error: string };
    assert.equal(result.error, "confirmation_required");
  });
});

describe("amplify_discover_review_preview", () => {
  it("shows 2 credits per post estimate", async () => {
    const tool = createAmplifyDiscoverReviewPreviewTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns?limit=100": () => ({
          status: 200,
          body: {
            success: true,
            campaigns: [{ id: "camp-1", campaign_number: "CP-042" }],
          },
        }),
        "/agents/campaigns/camp-1/posts": () => ({
          status: 200,
          body: { success: true, total: 4, posts: [{ id: "p1" }] },
        }),
      }),
    });
    const result = (await tool.execute({
      campaignId: "CP-042",
      reviewRules: "Must mention AI tools",
    })) as { creditsPerPost: number; estimatedCredits: number };
    assert.equal(result.creditsPerPost, 2);
    assert.equal(result.estimatedCredits, 8);
  });
});

describe("amplify_discover_review", () => {
  it("runs dry-run review when confirmed", async () => {
    const tool = createAmplifyDiscoverReviewTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch({
        "/agents/me": () => ({ status: 200, body: ME_LINKED }),
        "/agents/campaigns?limit=100": () => ({
          status: 200,
          body: {
            success: true,
            campaigns: [{ id: "camp-1", campaign_number: "CP-042" }],
          },
        }),
        "/agents/campaigns/camp-1/review-posts": () => ({
          status: 200,
          body: {
            success: true,
            dry_run: true,
            summary: { total_reviewed: 3, deleted: 0, kept: 3 },
            credits: { charged: 6, remaining: 494 },
          },
        }),
      }),
    });
    const result = (await tool.execute({
      campaignId: "CP-042",
      reviewRules: "On-topic only",
      dryRun: true,
      confirmed: true,
    })) as { ok: boolean; totalReviewed: number };
    assert.equal(result.ok, true);
    assert.equal(result.totalReviewed, 3);
  });
});
