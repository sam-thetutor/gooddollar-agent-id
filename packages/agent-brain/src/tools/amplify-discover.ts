import type { BrainTool } from "../types.js";
import {
  type AmplifyCampaignToolOptions,
  type AgentProfile,
  DISCOVER_CREATE_CREDITS,
  DISCOVER_GENERATE_CREDITS_PER_POST,
  confirmationRequiredMessage,
  isConfirmed,
  mapCampaignSummary,
  parseStringArray,
  productClankJson,
  requireLinkedProfile,
  resolveCampaignId,
} from "./amplify-campaign-shared.js";

function spendProfile(
  gate: AgentProfile | Record<string, unknown>,
): AgentProfile | null {
  if ("error" in gate && !("success" in gate)) return null;
  return gate as AgentProfile;
}

export function createAmplifyMyCampaignsTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_my_campaigns",
    description:
      "List Discover and Boost campaigns created by this agent on ProductClank. " +
      "Use when the operator asks about their campaigns, status, or admin links.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: 'Filter: "active", "paused", "completed", or omit for all',
        },
        limit: { type: "number", description: "Max results (default 15)" },
      },
    },
    async execute(args) {
      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;

      const params = new URLSearchParams();
      params.set("limit", String(Math.min(Number(args.limit) || 15, 50)));
      const status = String(args.status ?? "").trim();
      if (status) params.set("status", status);

      const { ok, status: httpStatus, body } = await productClankJson<{
        success?: boolean;
        campaigns?: Array<Record<string, unknown>>;
        total?: number;
      }>(options, `/agents/campaigns?${params}`);

      if (!ok || !body?.success) {
        return { error: `campaign list failed (HTTP ${httpStatus})` };
      }

      const campaigns = (body.campaigns ?? []).map(mapCampaignSummary);
      return {
        total: body.total ?? campaigns.length,
        campaigns: campaigns.map((c) => ({
          campaignId: c.id,
          number: c.number,
          title: c.title,
          status: c.status,
          adminUrl: c.adminUrl,
        })),
        note: "Use amplify_campaign_detail with campaignId or CP number for stats.",
      };
    },
  };
}

export function createAmplifyCampaignDetailTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_campaign_detail",
    description:
      "Get details and stats for one agent-owned ProductClank campaign (Discover or Boost). " +
      "Pass campaignId UUID or CP number like CP-042.",
    parameters: {
      type: "object",
      properties: {
        campaignId: {
          type: "string",
          description: "Campaign UUID, CP-042, or title keyword",
        },
      },
      required: ["campaignId"],
    },
    async execute(args) {
      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;

      const ref = String(args.campaignId ?? "").trim();
      const resolved = await resolveCampaignId(options, ref);
      if ("error" in resolved) return { error: resolved.error };

      const { ok, status, body } = await productClankJson<{
        success?: boolean;
        campaign?: Record<string, unknown>;
        stats?: Record<string, unknown>;
      }>(options, `/agents/campaigns/${resolved.id}`);

      if (!ok || !body?.success) {
        return { error: `campaign detail failed (HTTP ${status})` };
      }

      const c = mapCampaignSummary(body.campaign ?? {});
      const stats = body.stats ?? {};
      return {
        campaign: {
          campaignId: c.id,
          number: c.number,
          title: c.title,
          status: c.status,
          adminUrl: c.adminUrl,
          url: c.url,
          keywords: body.campaign?.keywords,
          searchContext: body.campaign?.search_context ?? body.campaign?.searchContext,
        },
        stats: {
          postsDiscovered: stats.posts_discovered ?? stats.postsDiscovered,
          repliesTotal: stats.replies_total ?? stats.repliesTotal,
          repliesByStatus: stats.replies_by_status ?? stats.repliesByStatus,
        },
        note: "Use amplify_campaign_posts to read discovered posts and reply drafts.",
      };
    },
  };
}

export function createAmplifyCampaignPostsTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_campaign_posts",
    description:
      "Read discovered posts and replies for a Discover campaign. Pass campaignId UUID " +
      "or CP number. Free — no credits charged.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign UUID or CP number" },
        limit: { type: "number", description: "Max posts to return (default 10)" },
      },
      required: ["campaignId"],
    },
    async execute(args) {
      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;

      const resolved = await resolveCampaignId(options, String(args.campaignId ?? ""));
      if ("error" in resolved) return { error: resolved.error };

      const limit = Math.min(Number(args.limit) || 10, 25);
      const { ok, status, body } = await productClankJson<{
        success?: boolean;
        posts?: Array<Record<string, unknown>>;
        total?: number;
      }>(options, `/agents/campaigns/${resolved.id}/posts?limit=${limit}`);

      if (!ok || !body?.success) {
        return { error: `read posts failed (HTTP ${status})` };
      }

      const posts = (body.posts ?? []).slice(0, limit).map((p) => ({
        postId: p.id,
        tweetUrl: p.tweet_url ?? p.tweetUrl,
        author: p.author_username ?? p.authorUsername,
        status: p.status,
        replyCount: Array.isArray(p.replies) ? p.replies.length : p.reply_count,
      }));

      return {
        campaignId: resolved.id,
        total: body.total ?? posts.length,
        posts,
        note:
          posts.length === 0
            ? "No posts yet — run amplify_discover_research then amplify_discover_generate."
            : "Participants can claim reply drafts from the Amplify feed once generation completes.",
      };
    },
  };
}

export function createAmplifyProductsListTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_products_list",
    description:
      "List a new product on ProductClank from a website URL (free). Use when products/search " +
      "finds no match and a Discover campaign needs a product_id. Requires operator confirmation.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Product website URL" },
        name: { type: "string", description: "Optional name override if URL fetch fails" },
        confirmed: {
          type: "boolean",
          description: "Must be true after operator confirms listing",
        },
      },
      required: ["url", "confirmed"],
    },
    async execute(args) {
      if (!isConfirmed(args)) {
        return confirmationRequiredMessage("amplify_products_list");
      }

      const url = String(args.url ?? "").trim();
      if (!url) return { error: "url is required" };

      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;

      const payload: Record<string, string> = { url };
      const name = String(args.name ?? "").trim();
      if (name) payload.name = name;

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        "/agents/products",
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "list_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      const product = (body.product ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        alreadyListed: body.already_listed ?? body.alreadyListed ?? false,
        productId: product.id,
        name: product.name,
        website: product.website ?? url,
        note: "Use this productId for amplify_discover_create or Boost.",
      };
    },
  };
}

export function createAmplifyDiscoverPreviewTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_discover_preview",
    description:
      "Preview credit cost to create a Discover campaign (10 credits fixed). Shows owner " +
      "balance and affordability. Call before amplify_discover_create.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "ProductClank product UUID" },
        title: { type: "string", description: "Campaign title" },
        keywords: {
          type: "string",
          description: "Comma-separated discovery keywords (3-7 recommended)",
        },
      },
      required: ["productId", "title", "keywords"],
    },
    async execute(args) {
      const productId = String(args.productId ?? "").trim();
      const title = String(args.title ?? "").trim();
      const keywords = parseStringArray(args.keywords);
      if (!productId || !title || !keywords?.length) {
        return { error: "productId, title, and keywords are required" };
      }

      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;
      const profile = gate as { credits?: number; linkedUserName?: string | null };

      const creditsRequired = DISCOVER_CREATE_CREDITS;
      const ownerCredits = profile.credits ?? 0;
      return {
        productId,
        title,
        keywords,
        creditsRequired,
        ownerCredits,
        canAfford: ownerCredits >= creditsRequired,
        linkedUserName: profile.linkedUserName,
        nextSteps:
          "After create: amplify_discover_research (free) → amplify_discover_generate " +
          `(~${DISCOVER_GENERATE_CREDITS_PER_POST} credits per post discovered)`,
        note:
          ownerCredits >= creditsRequired
            ? "Confirm with operator, then amplify_discover_create with confirmed=true."
            : `Need ${creditsRequired} credits; owner has ${ownerCredits}. Top up in ProductClank webapp.`,
      };
    },
  };
}

export function createAmplifyDiscoverCreateTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_discover_create",
    description:
      "Create a ProductClank Discover campaign (10 credits). Requires confirmed=true after " +
      "preview. Finds Twitter/X conversations matching keywords for community replies.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "ProductClank product UUID" },
        title: { type: "string", description: "Campaign title" },
        keywords: {
          type: "string",
          description: "Comma-separated keywords or JSON array",
        },
        searchContext: {
          type: "string",
          description: "Who/what conversations to target",
        },
        replyGuidelines: { type: "string", description: "Optional reply tone instructions" },
        maxPostAgeDays: { type: "number", description: "Max post age (3-7 recommended)" },
        minFollowerCount: { type: "number", description: "Minimum author followers" },
        confirmed: { type: "boolean", description: "Must be true after preview" },
      },
      required: ["productId", "title", "keywords", "searchContext", "confirmed"],
    },
    async execute(args) {
      if (!isConfirmed(args)) {
        return confirmationRequiredMessage("amplify_discover_create");
      }

      const productId = String(args.productId ?? "").trim();
      const title = String(args.title ?? "").trim();
      const keywords = parseStringArray(args.keywords);
      const searchContext = String(args.searchContext ?? args.search_context ?? "").trim();
      if (!productId || !title || !keywords?.length || !searchContext) {
        return { error: "productId, title, keywords, and searchContext are required" };
      }

      const gate = await requireLinkedProfile(options);
      const profile = spendProfile(gate);
      if (!profile) return gate;
      if ((profile.credits ?? 0) < DISCOVER_CREATE_CREDITS) {
        return {
          error: "insufficient_credits",
          creditsRequired: DISCOVER_CREATE_CREDITS,
          ownerCredits: profile.credits ?? 0,
        };
      }

      const payload: Record<string, unknown> = {
        product_id: productId,
        title,
        keywords,
        search_context: searchContext,
      };
      const guidelines = String(args.replyGuidelines ?? args.reply_guidelines ?? "").trim();
      if (guidelines) payload.reply_guidelines = guidelines;
      const maxAge = Number(args.maxPostAgeDays ?? args.max_post_age_days);
      if (Number.isFinite(maxAge) && maxAge > 0) payload.max_post_age_days = maxAge;
      const minFollowers = Number(args.minFollowerCount ?? args.min_follower_count);
      if (Number.isFinite(minFollowers) && minFollowers > 0) {
        payload.min_follower_count = minFollowers;
      }

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        "/agents/campaigns",
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "create_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      const campaign = mapCampaignSummary((body.campaign ?? {}) as Record<string, unknown>);
      const credits = (body.credits ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        campaign: {
          campaignId: campaign.id,
          number: campaign.number,
          title: campaign.title,
          adminUrl: campaign.adminUrl,
        },
        creditsUsed: credits.credits_used ?? credits.creditsUsed,
        creditsRemaining: credits.credits_remaining ?? credits.creditsRemaining,
        note:
          "Next: amplify_discover_research (free), then amplify_discover_generate after operator confirms.",
      };
    },
  };
}

export function createAmplifyDiscoverResearchTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_discover_research",
    description:
      "Run free AI research for a Discover campaign — expands keywords and improves targeting. " +
      "Call after amplify_discover_create and before generate-posts.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign UUID or CP number" },
      },
      required: ["campaignId"],
    },
    async execute(args) {
      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;

      const resolved = await resolveCampaignId(options, String(args.campaignId ?? ""));
      if ("error" in resolved) return { error: resolved.error };

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        `/agents/campaigns/${resolved.id}/research`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "research_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      const research = (body.research ?? body) as Record<string, unknown>;
      return {
        ok: true,
        campaignId: resolved.id,
        expandedKeywords: research.expanded_keywords ?? research.expandedKeywords,
        influencers: research.influencers,
        creditsUsed: 0,
        note: "Research is free. Next: amplify_discover_generate_preview then amplify_discover_generate.",
      };
    },
  };
}

export function createAmplifyDiscoverGeneratePreviewTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_discover_generate_preview",
    description:
      "Explain generate-posts credit cost before running discovery. Charges 12 credits per " +
      "post discovered — exact total unknown until generation completes. Shows owner balance.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign UUID or CP number" },
      },
      required: ["campaignId"],
    },
    async execute(args) {
      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;
      const profile = gate as { credits?: number };

      const resolved = await resolveCampaignId(options, String(args.campaignId ?? ""));
      if ("error" in resolved) return { error: resolved.error };

      const ownerCredits = profile.credits ?? 0;
      return {
        campaignId: resolved.id,
        creditsPerPost: DISCOVER_GENERATE_CREDITS_PER_POST,
        ownerCredits,
        canAffordMinimum: ownerCredits >= DISCOVER_GENERATE_CREDITS_PER_POST,
        note:
          `Generation costs ${DISCOVER_GENERATE_CREDITS_PER_POST} credits × posts discovered. ` +
          "Confirm with operator, then amplify_discover_generate with confirmed=true. " +
          "Run amplify_discover_research first if you have not already.",
      };
    },
  };
}

export function createAmplifyDiscoverGenerateTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_discover_generate",
    description:
      "Trigger Twitter/X discovery and AI reply generation for a Discover campaign. " +
      "Costs 12 credits per post found. Requires confirmed=true after preview.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign UUID or CP number" },
        confirmed: { type: "boolean", description: "Must be true after preview" },
      },
      required: ["campaignId", "confirmed"],
    },
    async execute(args) {
      if (!isConfirmed(args)) {
        return confirmationRequiredMessage("amplify_discover_generate");
      }

      const gate = await requireLinkedProfile(options);
      const profile = spendProfile(gate);
      if (!profile) return gate;
      if ((profile.credits ?? 0) < DISCOVER_GENERATE_CREDITS_PER_POST) {
        return {
          error: "insufficient_credits",
          ownerCredits: profile.credits ?? 0,
          creditsRequired: DISCOVER_GENERATE_CREDITS_PER_POST,
          message: "Owner needs at least 12 credits to start generation.",
        };
      }

      const resolved = await resolveCampaignId(options, String(args.campaignId ?? ""));
      if ("error" in resolved) return { error: resolved.error };

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        `/agents/campaigns/${resolved.id}/generate-posts`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "generate_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      const credits = (body.credits ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        campaignId: resolved.id,
        postsGenerated: body.postsGenerated ?? body.posts_generated,
        repliesGenerated: body.repliesGenerated ?? body.replies_generated,
        creditsUsed: credits.creditsUsed ?? credits.credits_used,
        creditsRemaining: credits.creditsRemaining ?? credits.credits_remaining,
        note: "Use amplify_campaign_posts to review results. Community can participate via the Amplify feed.",
      };
    },
  };
}
