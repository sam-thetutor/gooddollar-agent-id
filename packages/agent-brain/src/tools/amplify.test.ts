import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAmplifyPendingTool,
  createAmplifyMarkPostedTool,
  createAmplifyFeedTool,
  createAmplifyCampaignsTool,
  createAmplifyEarningsTool,
  platformFromUrl,
} from "./amplify.js";

function mockFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

const DRAFT = {
  replyId: "reply-1",
  replyText: "Great point — composable identity is the missing piece.",
  actionType: "reply",
  tweetUrl: "https://x.com/author/status/123",
  tweetText: "Agents need portable identity.",
  tweetAuthor: "author",
  campaignTitle: "CP-012 Launch",
  review: { verdict: "approve", note: "on topic" },
  queuedAt: "2026-08-13T00:00:00Z",
};

let queueFile: string;

beforeEach(() => {
  queueFile = join(mkdtempSync(join(tmpdir(), "amplify-")), "queue.json");
});

describe("amplify_pending", () => {
  it("returns an empty list with a note when queue file is missing", async () => {
    const tool = createAmplifyPendingTool({ queueFile });
    const result = (await tool.execute({})) as { pending: unknown[]; note: string };
    assert.equal(result.pending.length, 0);
    assert.match(result.note, /No drafts waiting/);
  });

  it("lists pending drafts with the exact text to post", async () => {
    writeFileSync(
      queueFile,
      JSON.stringify({ version: 1, pending: [DRAFT], posted: [] }),
    );
    const tool = createAmplifyPendingTool({ queueFile });
    const result = (await tool.execute({})) as {
      pending: Array<Record<string, unknown>>;
    };
    assert.equal(result.pending.length, 1);
    assert.equal(result.pending[0].replyId, "reply-1");
    assert.equal(result.pending[0].postThisText, DRAFT.replyText);
    assert.equal(result.pending[0].replyToPost, DRAFT.tweetUrl);
    assert.equal(result.pending[0].platform, "twitter");
    assert.equal(result.pending[0].aiReview, "approve");
  });
});

describe("amplify_mark_posted", () => {
  it("moves a pending draft to posted with the reply URL", async () => {
    writeFileSync(
      queueFile,
      JSON.stringify({ version: 1, pending: [DRAFT], posted: [] }),
    );
    const tool = createAmplifyMarkPostedTool({ queueFile });
    const result = (await tool.execute({
      replyId: "reply-1",
      replyUrl: "https://x.com/myagent/status/456",
    })) as { ok?: boolean };
    assert.equal(result.ok, true);

    const queue = JSON.parse(readFileSync(queueFile, "utf8"));
    assert.equal(queue.posted.length, 1);
    assert.equal(queue.posted[0].replyId, "reply-1");
    assert.equal(queue.posted[0].replyUrl, "https://x.com/myagent/status/456");
    // pending entry stays until the skill submits it (dedupe happens there)
    assert.equal(queue.pending.length, 1);
  });

  it("rejects URLs on unsupported hosts", async () => {
    writeFileSync(
      queueFile,
      JSON.stringify({ version: 1, pending: [DRAFT], posted: [] }),
    );
    const tool = createAmplifyMarkPostedTool({ queueFile });
    const result = (await tool.execute({
      replyId: "reply-1",
      replyUrl: "https://example.com/not-a-post",
    })) as { error?: string };
    assert.match(result.error ?? "", /does not look like a post URL/);
  });

  it("accepts TikTok and other platform post URLs", async () => {
    writeFileSync(
      queueFile,
      JSON.stringify({ version: 1, pending: [DRAFT], posted: [] }),
    );
    const tool = createAmplifyMarkPostedTool({ queueFile });
    const result = (await tool.execute({
      replyId: "reply-1",
      replyUrl: "https://www.tiktok.com/@myagent/video/7300000000000000000",
    })) as { ok?: boolean };
    assert.equal(result.ok, true);
  });

  it("errors on unknown replyId and detects already-posted drafts", async () => {
    writeFileSync(
      queueFile,
      JSON.stringify({
        version: 1,
        pending: [],
        posted: [{ replyId: "reply-1", replyUrl: "https://x.com/a/status/1", postedAt: "" }],
      }),
    );
    const tool = createAmplifyMarkPostedTool({ queueFile });

    const dupe = (await tool.execute({
      replyId: "reply-1",
      replyUrl: "https://x.com/a/status/2",
    })) as { error?: string };
    assert.match(dupe.error ?? "", /already marked as posted/);

    const missing = (await tool.execute({
      replyId: "reply-404",
      replyUrl: "https://x.com/a/status/3",
    })) as { error?: string };
    assert.match(missing.error ?? "", /no pending draft/);
  });
});

describe("platformFromUrl", () => {
  it("maps hosts to platforms", () => {
    assert.equal(platformFromUrl("https://x.com/a/status/1"), "twitter");
    assert.equal(platformFromUrl("https://twitter.com/a/status/1"), "twitter");
    assert.equal(platformFromUrl("https://www.tiktok.com/@a/video/1"), "tiktok");
    assert.equal(platformFromUrl("https://youtu.be/abc"), "youtube");
    assert.equal(platformFromUrl(undefined), "unknown");
  });
});

const FEED_BODY = {
  success: true,
  posts: [
    {
      id: "p1",
      campaign: { title: "Warm-up: ProductClank" },
      tweetUrl: "https://www.tiktok.com/@creator/video/1",
      tweetText: "cool video",
      author: { username: "creator" },
      unclaimedReplies: [
        { id: "d1", replyText: "nice edit!", actionType: "reply" },
      ],
    },
    {
      id: "p2",
      campaign: { title: "Boost: PANW" },
      tweetUrl: "https://x.com/analyst/status/9",
      tweetText: "PANW to $415",
      author: { username: "analyst" },
      unclaimedReplies: [
        { id: "d2", replyText: "bullish", actionType: "like" },
      ],
    },
  ],
};

describe("amplify_feed", () => {
  it("lists live drafts with platform totals", async () => {
    const tool = createAmplifyFeedTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch(200, FEED_BODY),
    });
    const result = (await tool.execute({})) as {
      totalAvailableByPlatform: Record<string, number>;
      drafts: Array<Record<string, unknown>>;
    };
    assert.deepEqual(result.totalAvailableByPlatform, { tiktok: 1, twitter: 1 });
    assert.equal(result.drafts.length, 2);
  });

  it("filters by platform, keeping the totals visible", async () => {
    const tool = createAmplifyFeedTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch(200, FEED_BODY),
    });
    const result = (await tool.execute({ platform: "Twitter" })) as {
      totalAvailableByPlatform: Record<string, number>;
      drafts: Array<Record<string, unknown>>;
    };
    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0].replyId, "d2");
    assert.deepEqual(result.totalAvailableByPlatform, { tiktok: 1, twitter: 1 });
  });

  it("surfaces API failures as tool errors", async () => {
    const tool = createAmplifyFeedTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch(500, { success: false }),
    });
    const result = (await tool.execute({})) as { error?: string };
    assert.match(result.error ?? "", /HTTP 500/);
  });
});

describe("amplify_campaigns", () => {
  const CAMPAIGNS_BODY = {
    campaigns: [
      {
        id: "uuid-17",
        campaignId: "CP-017",
        title: "3 stocks",
        product: { name: "TipRanks", tagline: "Wall Street research" },
        keywords: ["NVDA", "stock research"],
        platform: "twitter",
        campaignType: "discovery",
        boostActionType: null,
        totalParticipations: 1812,
        status: "active",
      },
      {
        id: "uuid-498",
        campaignId: "CP-498",
        title: "Warm-up: ProductClank",
        product: { name: "ProductClank" },
        keywords: ["tiktok"],
        platform: "tiktok",
        campaignType: "boost",
        boostActionType: "reply",
        totalParticipations: 40,
        status: "active",
      },
    ],
  };

  it("lists active campaigns with platform totals", async () => {
    const tool = createAmplifyCampaignsTool({
      fetchImpl: mockFetch(200, CAMPAIGNS_BODY),
    });
    const result = (await tool.execute({})) as {
      totalActive: number;
      totalByPlatform: Record<string, number>;
      matches: Array<Record<string, unknown>>;
    };
    assert.equal(result.totalActive, 2);
    assert.deepEqual(result.totalByPlatform, { twitter: 1, tiktok: 1 });
    assert.equal(result.matches.length, 2);
  });

  it("filters by platform and keyword", async () => {
    const tool = createAmplifyCampaignsTool({
      fetchImpl: mockFetch(200, CAMPAIGNS_BODY),
    });
    const byPlatform = (await tool.execute({ platform: "x" })) as {
      matches: Array<Record<string, unknown>>;
    };
    assert.equal(byPlatform.matches.length, 1);
    assert.equal(byPlatform.matches[0].campaign, "CP-017");

    const byQuery = (await tool.execute({ query: "nvda" })) as {
      matches: Array<Record<string, unknown>>;
    };
    assert.equal(byQuery.matches.length, 1);
    assert.equal(byQuery.matches[0].product, "TipRanks");
  });

  it("attaches live target-post links when a key is set", async () => {
    // First call serves the campaign list, second the participate feed.
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () =>
          call === 1
            ? CAMPAIGNS_BODY
            : {
                success: true,
                posts: [
                  {
                    campaignId: "uuid-498",
                    tweetUrl: "https://www.tiktok.com/@creator/video/1",
                  },
                  {
                    campaignId: "uuid-498",
                    tweetUrl: "https://www.tiktok.com/@creator/video/2",
                  },
                ],
              },
      };
    }) as unknown as typeof fetch;

    const tool = createAmplifyCampaignsTool({ apiKey: "pck_live_x", fetchImpl });
    const result = (await tool.execute({})) as {
      matches: Array<Record<string, unknown>>;
    };
    const warmup = result.matches.find((m) => m.campaign === "CP-498")!;
    assert.deepEqual(warmup.targetPosts, [
      "https://www.tiktok.com/@creator/video/1",
      "https://www.tiktok.com/@creator/video/2",
    ]);
    // No ProductClank page links — operators want the live posts, not Amplify pages.
    assert.equal(warmup.campaignUrl, undefined);

    const stocks = result.matches.find((m) => m.campaign === "CP-017")!;
    assert.equal(stocks.targetPosts, undefined);
    assert.equal(stocks.campaignUrl, undefined);
  });

  it("lists campaigns without links when no key is set", async () => {
    const tool = createAmplifyCampaignsTool({
      fetchImpl: mockFetch(200, CAMPAIGNS_BODY),
    });
    const result = (await tool.execute({})) as {
      matches: Array<Record<string, unknown>>;
    };
    assert.equal(result.matches[0].campaignUrl, undefined);
    assert.equal(result.matches[0].targetPosts, undefined);
  });
});

describe("amplify_earnings", () => {
  it("returns live earnings", async () => {
    const tool = createAmplifyEarningsTool({
      apiKey: "pck_live_x",
      fetchImpl: mockFetch(200, {
        success: true,
        points: 60,
        credits: 2,
        replies: { submitted: 3, approved: 3, rejected: 0, strikes: 0 },
        proClaim: { enabled: false },
      }),
    });
    const result = (await tool.execute({})) as { points: number; credits: number };
    assert.equal(result.points, 60);
    assert.equal(result.credits, 2);
  });
});
