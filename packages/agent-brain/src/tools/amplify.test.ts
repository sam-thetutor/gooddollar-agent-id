import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAmplifyPendingTool,
  createAmplifyMarkPostedTool,
} from "./amplify.js";

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
    assert.equal(result.pending[0].replyToTweet, DRAFT.tweetUrl);
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

  it("rejects URLs that are not tweet status links", async () => {
    writeFileSync(
      queueFile,
      JSON.stringify({ version: 1, pending: [DRAFT], posted: [] }),
    );
    const tool = createAmplifyMarkPostedTool({ queueFile });
    const result = (await tool.execute({
      replyId: "reply-1",
      replyUrl: "https://example.com/not-a-tweet",
    })) as { error?: string };
    assert.match(result.error ?? "", /does not look like a tweet URL/);
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
