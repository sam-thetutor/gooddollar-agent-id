import type { BrainTool } from "../types.js";
import {
  type AmplifyCampaignToolOptions,
  type AgentProfile,
  REGENERATE_CREDITS_PER_REPLY,
  REVIEW_POSTS_CREDITS_PER_POST,
  confirmationRequiredMessage,
  isConfirmed,
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

export function createAmplifyCreditsHistoryTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_credits_history",
    description:
      "Show recent ProductClank credit transactions for the linked owner (campaign spend, " +
      "top-ups). Use when the operator asks where credits went.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max transactions (default 10)" },
      },
    },
    async execute(args) {
      const gate = await requireLinkedProfile(options);
      if (!spendProfile(gate)) return gate;

      const limit = Math.min(Number(args.limit) || 10, 25);
      const { ok, status, body } = await productClankJson<{
        success?: boolean;
        transactions?: Array<Record<string, unknown>>;
        total?: number;
      }>(options, `/agents/credits/history?limit=${limit}`);

      if (!ok || !body?.success) {
        return { error: `credits history failed (HTTP ${status})` };
      }

      const transactions = (body.transactions ?? []).slice(0, limit).map((t) => ({
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after ?? t.balanceAfter,
        operation: t.operation_type ?? t.operationType,
        description: t.description,
        at: t.created_at ?? t.createdAt,
      }));

      return {
        total: body.total ?? transactions.length,
        transactions,
        note: "Credits are billed to the linked owner's ProductClank balance.",
      };
    },
  };
}

export function createAmplifyCampaignDelegateTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_campaign_delegate",
    description:
      "Add a ProductClank user as a delegator on a campaign so they can manage it in the " +
      "web dashboard. Requires the delegator's ProductClank user_id UUID.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign UUID or CP number" },
        userId: {
          type: "string",
          description: "ProductClank user UUID to add as delegator",
        },
        confirmed: {
          type: "boolean",
          description: "Must be true — operator confirmed adding this user",
        },
      },
      required: ["campaignId", "userId", "confirmed"],
    },
    async execute(args) {
      if (!isConfirmed(args)) {
        return confirmationRequiredMessage("amplify_campaign_delegate");
      }

      const userId = String(args.userId ?? args.user_id ?? "").trim();
      if (!userId) return { error: "userId is required" };

      const gate = await requireLinkedProfile(options);
      if (!spendProfile(gate)) return gate;

      const resolved = await resolveCampaignId(options, String(args.campaignId ?? ""));
      if ("error" in resolved) return { error: resolved.error };

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        `/agents/campaigns/${resolved.id}/delegates`,
        { method: "POST", body: JSON.stringify({ user_id: userId }) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "delegate_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      return {
        ok: true,
        campaignId: resolved.id,
        userId,
        alreadyDelegator: body.already_delegator ?? body.alreadyDelegator ?? false,
        message: body.message,
      };
    },
  };
}

export function createAmplifyDiscoverRegeneratePreviewTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_discover_regenerate_preview",
    description:
      "Preview cost to regenerate AI replies on Discover campaign posts (5 credits per reply). " +
      "Requires post IDs from amplify_campaign_posts.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign UUID or CP number" },
        postIds: {
          type: "string",
          description: "Comma-separated post UUIDs to regenerate",
        },
      },
      required: ["campaignId", "postIds"],
    },
    async execute(args) {
      const postIds = parseStringArray(args.postIds ?? args.post_ids);
      if (!postIds?.length) return { error: "postIds is required" };

      const gate = await requireLinkedProfile(options);
      const profile = spendProfile(gate);
      if (!profile) return gate;

      const resolved = await resolveCampaignId(options, String(args.campaignId ?? ""));
      if ("error" in resolved) return { error: resolved.error };

      const creditsRequired = postIds.length * REGENERATE_CREDITS_PER_REPLY;
      const ownerCredits = profile.credits ?? 0;
      return {
        campaignId: resolved.id,
        postIds,
        creditsPerReply: REGENERATE_CREDITS_PER_REPLY,
        creditsRequired,
        ownerCredits,
        canAfford: ownerCredits >= creditsRequired,
        note:
          ownerCredits >= creditsRequired
            ? "Confirm with operator, then amplify_discover_regenerate with confirmed=true."
            : "Insufficient owner credits for this regeneration batch.",
      };
    },
  };
}

export function createAmplifyDiscoverRegenerateTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_discover_regenerate",
    description:
      "Regenerate AI replies for selected Discover posts with new instructions. " +
      "5 credits per reply. Requires confirmed=true after preview.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign UUID or CP number" },
        postIds: { type: "string", description: "Comma-separated post UUIDs" },
        editRequest: {
          type: "string",
          description: 'How to change replies, e.g. "shorter and more casual"',
        },
        applyToSystemPrompt: {
          type: "boolean",
          description: "Also update campaign reply_guidelines",
        },
        confirmed: { type: "boolean", description: "Must be true after preview" },
      },
      required: ["campaignId", "postIds", "editRequest", "confirmed"],
    },
    async execute(args) {
      if (!isConfirmed(args)) {
        return confirmationRequiredMessage("amplify_discover_regenerate");
      }

      const postIds = parseStringArray(args.postIds ?? args.post_ids);
      const editRequest = String(args.editRequest ?? args.edit_request ?? "").trim();
      if (!postIds?.length || !editRequest) {
        return { error: "postIds and editRequest are required" };
      }

      const gate = await requireLinkedProfile(options);
      const profile = spendProfile(gate);
      if (!profile) return gate;

      const minCredits = postIds.length * REGENERATE_CREDITS_PER_REPLY;
      if ((profile.credits ?? 0) < minCredits) {
        return {
          error: "insufficient_credits",
          creditsRequired: minCredits,
          ownerCredits: profile.credits ?? 0,
        };
      }

      const resolved = await resolveCampaignId(options, String(args.campaignId ?? ""));
      if ("error" in resolved) return { error: resolved.error };

      const payload: Record<string, unknown> = {
        post_ids: postIds,
        edit_request: editRequest,
      };
      if (args.applyToSystemPrompt === true) {
        payload.apply_to_system_prompt = true;
      }

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        `/agents/campaigns/${resolved.id}/regenerate-replies`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "regenerate_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      const summary = (body.summary ?? {}) as Record<string, unknown>;
      const credits = (body.credits ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        campaignId: resolved.id,
        repliesRegenerated: summary.replies_regenerated ?? summary.repliesRegenerated,
        creditsCharged: credits.charged ?? credits.credits_used,
        creditsRemaining: credits.remaining ?? credits.credits_remaining,
        editRequest: body.edit_request ?? editRequest,
      };
    },
  };
}

export function createAmplifyDiscoverReviewPreviewTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_discover_review_preview",
    description:
      "Preview cost for AI relevancy review on Discover posts (2 credits per post reviewed).",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign UUID or CP number" },
        reviewRules: {
          type: "string",
          description: "Relevancy rules for scoring posts",
        },
      },
      required: ["campaignId", "reviewRules"],
    },
    async execute(args) {
      const reviewRules = String(args.reviewRules ?? args.review_rules ?? "").trim();
      if (!reviewRules) return { error: "reviewRules is required" };

      const gate = await requireLinkedProfile(options);
      const profile = spendProfile(gate);
      if (!profile) return gate;

      const resolved = await resolveCampaignId(options, String(args.campaignId ?? ""));
      if ("error" in resolved) return { error: resolved.error };

      const { ok, body } = await productClankJson<{
        success?: boolean;
        posts?: unknown[];
        total?: number;
      }>(options, `/agents/campaigns/${resolved.id}/posts?limit=1`);

      const postCount =
        ok && body?.success ? (body.total ?? body.posts?.length ?? 0) : null;

      return {
        campaignId: resolved.id,
        creditsPerPost: REVIEW_POSTS_CREDITS_PER_POST,
        estimatedPosts: postCount,
        estimatedCredits:
          postCount != null ? postCount * REVIEW_POSTS_CREDITS_PER_POST : null,
        ownerCredits: profile.credits ?? 0,
        note:
          "Review charges 2 credits per post scored. Use amplify_discover_review with " +
          "dryRun=true to score without deleting, or dryRun=false to remove irrelevant posts.",
      };
    },
  };
}

export function createAmplifyDiscoverReviewTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_discover_review",
    description:
      "AI relevancy review of Discover campaign posts. 2 credits/post. Set dryRun=true to " +
      "score only; dryRun=false deletes posts below threshold. Requires confirmed=true.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign UUID or CP number" },
        reviewRules: { type: "string", description: "Relevancy rules" },
        threshold: {
          type: "number",
          description: "Score threshold 1-10 (default 5)",
        },
        dryRun: {
          type: "boolean",
          description: "true = score only, false = delete irrelevant posts",
        },
        confirmed: { type: "boolean", description: "Must be true" },
      },
      required: ["campaignId", "reviewRules", "confirmed"],
    },
    async execute(args) {
      if (!isConfirmed(args)) {
        return confirmationRequiredMessage("amplify_discover_review");
      }

      const reviewRules = String(args.reviewRules ?? args.review_rules ?? "").trim();
      if (!reviewRules) return { error: "reviewRules is required" };

      const gate = await requireLinkedProfile(options);
      if (!spendProfile(gate)) return gate;

      const resolved = await resolveCampaignId(options, String(args.campaignId ?? ""));
      if ("error" in resolved) return { error: resolved.error };

      const payload: Record<string, unknown> = {
        review_rules: reviewRules,
        dry_run: args.dryRun === true || String(args.dryRun).toLowerCase() === "true",
        save_rules: true,
      };
      const threshold = Number(args.threshold);
      if (Number.isFinite(threshold) && threshold >= 1 && threshold <= 10) {
        payload.threshold = threshold;
      }

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        `/agents/campaigns/${resolved.id}/review-posts`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "review_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      const summary = (body.summary ?? {}) as Record<string, unknown>;
      const credits = (body.credits ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        campaignId: resolved.id,
        dryRun: body.dry_run ?? payload.dry_run,
        totalReviewed: summary.total_reviewed ?? summary.totalReviewed,
        deleted: summary.deleted,
        kept: summary.kept,
        creditsCharged: credits.charged,
        creditsRemaining: credits.remaining,
      };
    },
  };
}
