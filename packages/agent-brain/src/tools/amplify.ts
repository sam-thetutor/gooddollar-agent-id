import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { BrainTool } from "../types.js";

/**
 * Amplify (ProductClank) approval-loop tools.
 *
 * The `productclank-participant` skill writes reviewed reply drafts into a
 * shared queue file. These tools let the operator, via Telegram:
 *  - `amplify_pending`     — list drafts waiting to be posted on X
 *  - `amplify_mark_posted` — report the URL of a posted reply so the skill
 *                            can submit it to ProductClank
 */
export interface AmplifyToolOptions {
  /** Absolute path to the skill's amplify-queue.json. */
  queueFile: string;
}

interface PendingDraft {
  replyId: string;
  replyText: string;
  actionType?: string;
  tweetUrl?: string;
  tweetText?: string;
  tweetAuthor?: string;
  campaignTitle?: string;
  review?: { verdict?: string; note?: string };
  queuedAt?: string;
}

interface AmplifyQueue {
  version: 1;
  pending: PendingDraft[];
  posted: { replyId: string; replyUrl: string; postedAt: string }[];
}

function loadQueue(file: string): AmplifyQueue {
  if (!existsSync(file)) {
    return { version: 1, pending: [], posted: [] };
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as AmplifyQueue;
  return {
    version: 1,
    pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    posted: Array.isArray(parsed.posted) ? parsed.posted : [],
  };
}

const X_STATUS_URL =
  /^https:\/\/(x\.com|twitter\.com)\/[A-Za-z0-9_]{1,15}\/status\/\d+/;

export function createAmplifyPendingTool(
  options: AmplifyToolOptions,
): BrainTool {
  return {
    name: "amplify_pending",
    description:
      "List ProductClank Amplify reply drafts waiting for the operator to post on X. " +
      "Use when the user asks about pending Amplify drafts, campaign tasks, or what to post. " +
      "Show each draft's replyId, the tweet to reply to, and the exact draft text.",
    parameters: { type: "object", properties: {} },
    async execute() {
      let queue: AmplifyQueue;
      try {
        queue = loadQueue(options.queueFile);
      } catch (error) {
        return { error: `could not read queue: ${(error as Error).message}` };
      }
      if (queue.pending.length === 0) {
        return {
          pending: [],
          note: "No drafts waiting. The skill polls the campaign feed on a schedule; check back later.",
        };
      }
      return {
        pending: queue.pending.map((draft) => ({
          replyId: draft.replyId,
          postThisText: draft.replyText,
          replyToTweet: draft.tweetUrl,
          originalTweet: draft.tweetText,
          author: draft.tweetAuthor,
          campaign: draft.campaignTitle,
          aiReview: draft.review?.verdict ?? "unreviewed",
          reviewNote: draft.review?.note,
        })),
        instructions:
          "The operator must post the draft text as a reply to the tweet FROM THE AGENT'S X ACCOUNT, " +
          "then report the posted reply URL with amplify_mark_posted.",
      };
    },
  };
}

export function createAmplifyMarkPostedTool(
  options: AmplifyToolOptions,
): BrainTool {
  return {
    name: "amplify_mark_posted",
    description:
      "Record that an Amplify reply draft was posted on X. Call this when the operator " +
      "sends the URL of the reply they posted. Requires the draft's replyId and the posted " +
      "tweet URL (https://x.com/<handle>/status/<id>). The skill submits it to ProductClank " +
      "on its next pass.",
    parameters: {
      type: "object",
      properties: {
        replyId: {
          type: "string",
          description: "The replyId of the pending draft that was posted",
        },
        replyUrl: {
          type: "string",
          description: "URL of the posted reply tweet on x.com",
        },
      },
      required: ["replyId", "replyUrl"],
    },
    async execute(args) {
      const replyId = String(args.replyId ?? "").trim();
      const replyUrl = String(args.replyUrl ?? "").trim();
      if (!replyId || !replyUrl) {
        return { error: "replyId and replyUrl are both required" };
      }
      if (!X_STATUS_URL.test(replyUrl)) {
        return {
          error:
            "replyUrl does not look like a tweet URL — expected https://x.com/<handle>/status/<id>",
        };
      }

      let queue: AmplifyQueue;
      try {
        queue = loadQueue(options.queueFile);
      } catch (error) {
        return { error: `could not read queue: ${(error as Error).message}` };
      }

      const draft = queue.pending.find((d) => d.replyId === replyId);
      if (!draft) {
        const alreadyPosted = queue.posted.some((p) => p.replyId === replyId);
        return {
          error: alreadyPosted
            ? `draft ${replyId} is already marked as posted`
            : `no pending draft with replyId ${replyId} — call amplify_pending to see the current queue`,
        };
      }

      queue.posted.push({
        replyId,
        replyUrl,
        postedAt: new Date().toISOString(),
      });
      writeFileSync(options.queueFile, JSON.stringify(queue, null, 2));

      return {
        ok: true,
        replyId,
        message:
          "Recorded. The skill will verify and submit it to ProductClank within the next worker pass " +
          "(up to ~30 minutes). Points and $PRO show up after ProductClank review.",
      };
    },
  };
}
