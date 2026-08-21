import type { BrainTool } from "../types.js";
import {
  BOOST_ACTION_CREDITS,
  type AmplifyCampaignToolOptions,
  fetchAgentProfile,
  isOwnerLinked,
  requireLinkedProfile,
  confirmationRequiredMessage,
  isConfirmed,
  productClankJson,
} from "./amplify-campaign-shared.js";

export type { AmplifyCampaignToolOptions } from "./amplify-campaign-shared.js";
export { BOOST_ACTION_CREDITS } from "./amplify-campaign-shared.js";

export function normalizeBoostAction(raw: unknown): string | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (value === "reply" || value === "replies") return "replies";
  if (value === "like" || value === "likes") return "likes";
  if (value === "repost" || value === "reposts") return "reposts";
  return null;
}

export function createAmplifyAccountTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_account",
    description:
      "Get ProductClank account status for this agent: whether the owner linked their " +
      "ProductClank account (required before spending credits on Boost), the owner's " +
      "credit balance, and the agent's registered X handle. Use before any paid campaign action.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const profile = await fetchAgentProfile(options);
      if (!profile.success) {
        return {
          error: profile.message ?? profile.error ?? "Could not load ProductClank account",
        };
      }
      return {
        linked: isOwnerLinked(profile),
        linkedUserName: profile.linkedUserName,
        ownerCredits: profile.credits ?? 0,
        xHandle: profile.xHandle,
        agentName: profile.agentName,
        note: isOwnerLinked(profile)
          ? "Campaign spend uses the linked owner's ProductClank credits."
          : "Link required before Boost — owner links from the GoodAgent deploy dashboard.",
      };
    },
  };
}

export function createAmplifyProductsSearchTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_products_search",
    description:
      "Search products on ProductClank by name or keyword. Use when the operator wants " +
      "to link a Boost or campaign to a specific product — confirm the match before spending credits.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Product name or keyword to search",
        },
      },
      required: ["query"],
    },
    async execute(args) {
      const query = String(args.query ?? "").trim();
      if (!query) return { error: "query is required" };

      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;

      const { ok, status, body } = await productClankJson<{
        success?: boolean;
        products?: Array<Record<string, unknown>>;
        message?: string;
        error?: string;
      }>(
        options,
        `/agents/products/search?${new URLSearchParams({ q: query, limit: "5" })}`,
      );
      if (!ok || !body?.success) {
        return { error: body?.message ?? body?.error ?? `HTTP ${status}` };
      }
      const products = (body.products ?? []).slice(0, 5).map((p) => ({
        productId: p.id,
        name: p.name,
        tagline: p.tagline,
        url: p.url,
      }));
      return {
        query,
        products,
        note:
          products.length === 0
            ? "No products matched — list one with amplify_products_list or run Boost without product_id."
            : "Confirm the correct product with the operator before spending credits.",
      };
    },
  };
}

function parseBoostArgs(args: Record<string, unknown>): {
  postUrl: string;
  actionType: string;
  productId?: string;
  replyGuidelines?: string;
  postText?: string;
  postAuthor?: string;
  error?: string;
} {
  const postUrl = String(args.postUrl ?? args.post_url ?? "").trim();
  if (!postUrl) return { postUrl: "", actionType: "replies", error: "postUrl is required" };
  const actionType = normalizeBoostAction(args.actionType ?? args.action_type) ?? "replies";
  if (actionType === "reposts") {
    const host = postUrl.split("/")[2]?.toLowerCase() ?? "";
    if (
      !host.endsWith("x.com") &&
      !host.endsWith("twitter.com") &&
      !host.endsWith("warpcast.com") &&
      !host.endsWith("farcaster.xyz")
    ) {
      return {
        postUrl,
        actionType,
        error: "reposts are only supported on Twitter/X and Farcaster",
      };
    }
  }
  return {
    postUrl,
    actionType,
    productId: String(args.productId ?? args.product_id ?? "").trim() || undefined,
    replyGuidelines:
      String(args.replyGuidelines ?? args.reply_guidelines ?? "").trim() || undefined,
    postText: String(args.postText ?? args.post_text ?? "").trim() || undefined,
    postAuthor: String(args.postAuthor ?? args.post_author ?? "").trim() || undefined,
  };
}

export function createAmplifyBoostPreviewTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_boost_preview",
    description:
      "Preview a ProductClank Boost before spending credits: shows the credit cost, " +
      "the owner's balance, and whether they can afford it. Always call this before " +
      "amplify_boost_post and get explicit operator confirmation.",
    parameters: {
      type: "object",
      properties: {
        postUrl: { type: "string", description: "URL of the post to boost" },
        actionType: {
          type: "string",
          description: 'Engagement type: "replies" (default), "likes", or "reposts"',
        },
        productId: {
          type: "string",
          description: "Optional ProductClank product UUID",
        },
      },
      required: ["postUrl"],
    },
    async execute(args) {
      const parsed = parseBoostArgs(args);
      if (parsed.error) return { error: parsed.error };

      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;
      const profile = gate as Awaited<ReturnType<typeof fetchAgentProfile>>;

      const creditsRequired = BOOST_ACTION_CREDITS[parsed.actionType] ?? 0;
      const ownerCredits = profile.credits ?? 0;
      return {
        postUrl: parsed.postUrl,
        actionType: parsed.actionType,
        productId: parsed.productId ?? null,
        creditsRequired,
        ownerCredits,
        canAfford: ownerCredits >= creditsRequired,
        linkedUserName: profile.linkedUserName,
        note:
          ownerCredits >= creditsRequired
            ? `Confirm with the operator, then call amplify_boost_post with confirmed=true.`
            : `Insufficient credits (${ownerCredits} available, ${creditsRequired} required). Owner must top up in the ProductClank webapp.`,
      };
    },
  };
}

export function createAmplifyBoostPostTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_boost_post",
    description:
      "Launch a ProductClank Boost campaign using the linked owner's credits. Requires " +
      "confirmed=true after amplify_boost_preview and explicit operator approval. " +
      "Never call without confirmation.",
    parameters: {
      type: "object",
      properties: {
        postUrl: { type: "string", description: "URL of the post to boost" },
        actionType: {
          type: "string",
          description: '"replies", "likes", or "reposts" (default replies)',
        },
        productId: { type: "string", description: "Optional product UUID" },
        replyGuidelines: {
          type: "string",
          description: "Tone/focus for generated replies (replies action only)",
        },
        postText: {
          type: "string",
          description: "Optional post text (recommended for non-Twitter platforms)",
        },
        postAuthor: {
          type: "string",
          description: "Optional post author handle (with postText)",
        },
        confirmed: {
          type: "boolean",
          description: "Must be true — operator confirmed after preview",
        },
      },
      required: ["postUrl", "confirmed"],
    },
    async execute(args) {
      if (!isConfirmed(args)) return confirmationRequiredMessage("amplify_boost_post");

      const parsed = parseBoostArgs(args);
      if (parsed.error) return { error: parsed.error };

      const gate = await requireLinkedProfile(options);
      if ("error" in gate && !("credits" in gate)) return gate;
      const profile = gate as Awaited<ReturnType<typeof fetchAgentProfile>>;

      const creditsRequired = BOOST_ACTION_CREDITS[parsed.actionType] ?? 0;
      if ((profile.credits ?? 0) < creditsRequired) {
        return {
          error: "insufficient_credits",
          ownerCredits: profile.credits ?? 0,
          creditsRequired,
          message: "Owner credit balance is too low — top up in the ProductClank webapp.",
        };
      }

      const payload: Record<string, string> = {
        post_url: parsed.postUrl,
        action_type: parsed.actionType,
      };
      if (parsed.productId) payload.product_id = parsed.productId;
      if (parsed.replyGuidelines) payload.reply_guidelines = parsed.replyGuidelines;
      if (parsed.postText) payload.post_text = parsed.postText;
      if (parsed.postAuthor) payload.post_author = parsed.postAuthor;

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        "/agents/campaigns/boost",
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "boost_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      const campaign = (body.campaign ?? {}) as Record<string, unknown>;
      const credits = (body.credits ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        campaign: {
          id: campaign.id,
          number: campaign.campaign_number ?? campaign.campaignNumber,
          platform: campaign.platform,
          url: campaign.url,
        },
        itemsGenerated: body.items_generated ?? body.itemsGenerated,
        creditsUsed: credits.credits_used ?? credits.creditsUsed,
        creditsRemaining: credits.credits_remaining ?? credits.creditsRemaining,
        isReboost: body.is_reboost ?? body.isReboost ?? false,
        note: "Community engagement is now live — share the campaign dashboard URL with the operator.",
      };
    },
  };
}
