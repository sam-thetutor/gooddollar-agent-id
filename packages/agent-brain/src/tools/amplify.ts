import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { BrainTool } from "../types.js";

/**
 * Amplify (ProductClank) approval-loop tools.
 *
 * The `productclank-participant` skill writes reviewed reply drafts into a
 * shared queue file. These tools let the operator, via Telegram:
 *  - `amplify_pending`     — list queued drafts waiting to be posted
 *  - `amplify_mark_posted` — report the URL of a posted reply so the skill
 *                            can submit it to ProductClank
 *  - `amplify_feed`        — browse ALL live drafts on ProductClank (not just
 *                            the local queue), filterable by platform
 *  - `amplify_campaigns`   — search active Amplify campaigns (the workbench
 *                            list), filterable by platform and keyword
 *  - `amplify_earnings`    — live points/credits/strikes/$PRO status
 */
export interface AmplifyToolOptions {
  /** Absolute path to the skill's amplify-queue.json. */
  queueFile: string;
}

export interface AmplifyApiToolOptions {
  /** ProductClank agent API key (pck_live_…). */
  apiKey: string;
  /** Defaults to the production ProductClank API. */
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

export interface AmplifyCampaignsToolOptions {
  /** Defaults to the production ProductClank webapp. */
  webBase?: string;
  /**
   * Optional agent API key. When present, the tool cross-references the
   * participate feed to attach live target-post URLs to each campaign.
   */
  apiKey?: string;
  /** Defaults to the production ProductClank API. */
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

const PRODUCTCLANK_API_BASE = "https://api.productclank.com/api/v1";
const PRODUCTCLANK_WEB_BASE = "https://www.productclank.com";

/** Map a target-post URL to the platform it lives on. */
export function platformFromUrl(url: string | undefined): string {
  const host = (url ?? "").split("/")[2]?.toLowerCase() ?? "";
  if (host.endsWith("x.com") || host.endsWith("twitter.com")) return "twitter";
  if (host.endsWith("tiktok.com")) return "tiktok";
  if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  if (host.endsWith("instagram.com")) return "instagram";
  if (host.endsWith("linkedin.com")) return "linkedin";
  if (host.endsWith("reddit.com")) return "reddit";
  if (host.endsWith("warpcast.com") || host.endsWith("farcaster.xyz")) {
    return "farcaster";
  }
  return host || "unknown";
}

function normalizePlatformArg(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value || value === "all" || value === "any") return null;
  if (value === "x" || value === "twitter/x" || value === "twitter") return "twitter";
  return value;
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

/**
 * Campaign targets span platforms (Twitter/X, TikTok, YouTube, Instagram,
 * LinkedIn, Reddit, Farcaster) — accept a posted-reply URL from any of them.
 * ProductClank does its own author verification on submit.
 */
const POSTED_REPLY_URL =
  /^https:\/\/(www\.)?(x\.com|twitter\.com|tiktok\.com|youtube\.com|youtu\.be|instagram\.com|linkedin\.com|reddit\.com|warpcast\.com|farcaster\.xyz)\/\S+$/i;

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
          replyToPost: draft.tweetUrl,
          platform: platformFromUrl(draft.tweetUrl),
          originalPost: draft.tweetText,
          author: draft.tweetAuthor,
          campaign: draft.campaignTitle,
          aiReview: draft.review?.verdict ?? "unreviewed",
          reviewNote: draft.review?.note,
        })),
        instructions:
          "This is the local approval queue only — use amplify_feed to browse everything live on " +
          "ProductClank. The operator must post the draft text as a reply/comment on the target " +
          "post (platform shown per draft) from the agent's registered account, then report the " +
          "posted URL with amplify_mark_posted.",
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
      if (!POSTED_REPLY_URL.test(replyUrl)) {
        return {
          error:
            "replyUrl does not look like a post URL on a supported platform " +
            "(x.com, tiktok.com, youtube.com, instagram.com, linkedin.com, reddit.com, warpcast.com)",
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

// ---- live ProductClank tools -------------------------------------------------

interface FeedPost {
  id: string;
  campaign?: { title?: string; campaignNumber?: string };
  tweetUrl?: string;
  tweetText?: string;
  author?: { username?: string };
  unclaimedReplies?: Array<{ id: string; replyText: string; actionType?: string }>;
}

export function createAmplifyFeedTool(options: AmplifyApiToolOptions): BrainTool {
  const fetchFn = options.fetchImpl ?? fetch;
  const base = (options.apiBase ?? PRODUCTCLANK_API_BASE).replace(/\/$/, "");
  return {
    name: "amplify_feed",
    description:
      "Browse ALL reply drafts currently available on ProductClank Amplify (the live feed, " +
      "not just the local queue). Use when the user asks what campaigns or drafts are available, " +
      "optionally for one platform (twitter, tiktok, youtube, …). Drafts here are unclaimed; " +
      "the skill queues a few at a time for approval.",
    parameters: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description:
            'Filter by target platform: "twitter", "tiktok", "youtube", "instagram", "linkedin", "reddit", "farcaster". Omit for all.',
        },
      },
    },
    async execute(args) {
      const platform = normalizePlatformArg(args.platform);
      const res = await fetchFn(`${base}/agents/participate/feed?limit=50`, {
        headers: { Authorization: `Bearer ${options.apiKey}` },
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        posts?: FeedPost[];
      } | null;
      if (!res.ok || !body?.success) {
        return { error: `ProductClank feed failed (HTTP ${res.status})` };
      }

      const posts = body.posts ?? [];
      const byPlatform: Record<string, number> = {};
      const drafts: Array<Record<string, unknown>> = [];
      for (const post of posts) {
        const postPlatform = platformFromUrl(post.tweetUrl);
        for (const draft of post.unclaimedReplies ?? []) {
          byPlatform[postPlatform] = (byPlatform[postPlatform] ?? 0) + 1;
          if (platform && postPlatform !== platform) continue;
          if (drafts.length >= 15) continue;
          drafts.push({
            replyId: draft.id,
            postThisText: draft.replyText,
            actionType: draft.actionType,
            platform: postPlatform,
            replyToPost: post.tweetUrl,
            author: post.author?.username,
            campaign: post.campaign?.title,
          });
        }
      }

      return {
        totalAvailableByPlatform: byPlatform,
        ...(platform ? { filteredPlatform: platform } : {}),
        drafts,
        note:
          drafts.length === 0
            ? platform
              ? `No drafts targeting ${platform} right now — totals by platform show what is available.`
              : "No drafts available on ProductClank right now."
            : "These are live on ProductClank. Only drafts already in the local queue " +
              "(amplify_pending) can be marked as posted; the skill pulls new ones from this " +
              "feed on each pass as the queue empties.",
      };
    },
  };
}

interface WorkbenchCampaign {
  id?: string;
  campaignId?: string;
  title?: string;
  product?: { name?: string; tagline?: string };
  keywords?: string[];
  platform?: string;
  campaignType?: string;
  boostActionType?: string | null;
  totalParticipations?: number;
  status?: string;
}

export function createAmplifyCampaignsTool(
  options: AmplifyCampaignsToolOptions = {},
): BrainTool {
  const fetchFn = options.fetchImpl ?? fetch;
  const base = (options.webBase ?? PRODUCTCLANK_WEB_BASE).replace(/\/$/, "");
  const apiBase = (options.apiBase ?? PRODUCTCLANK_API_BASE).replace(/\/$/, "");

  /** campaign uuid → live target-post URLs (from the participate feed). */
  async function fetchPostLinks(): Promise<Map<string, string[]>> {
    const links = new Map<string, string[]>();
    if (!options.apiKey) return links;
    try {
      const res = await fetchFn(`${apiBase}/agents/participate/feed?limit=50`, {
        headers: { Authorization: `Bearer ${options.apiKey}` },
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        posts?: Array<{ campaignId?: string; tweetUrl?: string }>;
      } | null;
      if (!res.ok || !body?.success) return links;
      for (const post of body.posts ?? []) {
        if (!post.campaignId || !post.tweetUrl) continue;
        const urls = links.get(post.campaignId) ?? [];
        if (urls.length < 3 && !urls.includes(post.tweetUrl)) {
          urls.push(post.tweetUrl);
        }
        links.set(post.campaignId, urls);
      }
    } catch {
      // Post links are best-effort decoration — never fail the campaign list.
    }
    return links;
  }

  return {
    name: "amplify_campaigns",
    description:
      "Search the active ProductClank Amplify campaigns (the public workbench list). " +
      "Use when the user asks which campaigns exist, what they can join, or campaigns " +
      "for a platform or topic. Joining happens implicitly: posting a draft from the " +
      "feed for that campaign counts as participating.",
    parameters: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description:
            'Filter by platform: "twitter", "tiktok", "youtube", … Omit for all.',
        },
        query: {
          type: "string",
          description:
            "Keyword to match against campaign title, product name, and keywords.",
        },
      },
    },
    async execute(args) {
      const platform = normalizePlatformArg(args.platform);
      const query = String(args.query ?? "").trim().toLowerCase();

      const res = await fetchFn(
        `${base}/api/communiply/list?status=active&includeContent=true`,
        { headers: { "user-agent": "goodagent-brain" } },
      );
      const body = (await res.json().catch(() => null)) as {
        campaigns?: WorkbenchCampaign[];
      } | null;
      if (!res.ok || !Array.isArray(body?.campaigns)) {
        return { error: `campaign list failed (HTTP ${res.status})` };
      }

      const byPlatform: Record<string, number> = {};
      for (const c of body.campaigns) {
        const p = (c.platform ?? "unknown").toLowerCase();
        byPlatform[p] = (byPlatform[p] ?? 0) + 1;
      }

      const matches = body.campaigns.filter((c) => {
        if (platform && (c.platform ?? "").toLowerCase() !== platform) return false;
        if (!query) return true;
        const haystack = [
          c.title ?? "",
          c.product?.name ?? "",
          c.product?.tagline ?? "",
          ...(c.keywords ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });

      const postLinks = await fetchPostLinks();

      return {
        totalActive: body.campaigns.length,
        totalByPlatform: byPlatform,
        matches: matches.slice(0, 15).map((c) => ({
          campaign: c.campaignId,
          title: c.title,
          product: c.product?.name,
          platform: c.platform,
          type: c.boostActionType
            ? `boost (${c.boostActionType})`
            : c.campaignType,
          participations: c.totalParticipations,
          ...(c.id && postLinks.get(c.id)?.length
            ? { targetPosts: postLinks.get(c.id) }
            : {}),
        })),
        ...(matches.length > 15 ? { truncated: matches.length - 15 } : {}),
        note:
          "targetPosts are the live posts to engage (on Twitter/TikTok/etc.) — always show them " +
          "to the operator when present. To participate, drafts for these campaigns appear in the " +
          "feed (amplify_feed) and get queued for operator approval (amplify_pending). There is " +
          "no separate join step.",
      };
    },
  };
}

export function createAmplifyEarningsTool(options: AmplifyApiToolOptions): BrainTool {
  const fetchFn = options.fetchImpl ?? fetch;
  const base = (options.apiBase ?? PRODUCTCLANK_API_BASE).replace(/\/$/, "");
  return {
    name: "amplify_earnings",
    description:
      "Get the agent's live ProductClank Amplify earnings: leaderboard points, credits, " +
      "approved/rejected replies, strikes, and $PRO claim status. Use when the user asks " +
      "how much the agent has earned on Amplify.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const res = await fetchFn(`${base}/agents/participate/earnings`, {
        headers: { Authorization: `Bearer ${options.apiKey}` },
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        points?: number;
        credits?: number;
        replies?: {
          submitted?: number;
          approved?: number;
          rejected?: number;
          strikes?: number;
        };
        proClaim?: {
          enabled?: boolean;
          claimableCount?: number;
          totalClaimed?: number;
          amountPerClaim?: number;
        };
      } | null;
      if (!res.ok || !body?.success) {
        return { error: `earnings failed (HTTP ${res.status})` };
      }
      return {
        points: body.points ?? 0,
        credits: body.credits ?? 0,
        replies: body.replies ?? {},
        proClaim: body.proClaim ?? { enabled: false },
      };
    },
  };
}
