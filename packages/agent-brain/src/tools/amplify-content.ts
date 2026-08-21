import type { BrainTool } from "../types.js";
import {
  type AmplifyCampaignToolOptions,
  type AgentProfile,
  CONTENT_CAMPAIGN_CREDITS,
  confirmationRequiredMessage,
  isConfirmed,
  parseStringArray,
  productClankJson,
  requireLinkedProfile,
} from "./amplify-campaign-shared.js";

function spendProfile(
  gate: AgentProfile | Record<string, unknown>,
): AgentProfile | null {
  if ("error" in gate && !("success" in gate)) return null;
  return gate as AgentProfile;
}

function parseContentPayload(args: Record<string, unknown>): {
  productId: string;
  campaignMessage: string;
  campaignGoals?: string[];
  targetAudience?: string;
  preferredPlatform?: string;
  additionalGuidelines?: string;
  references?: string;
  error?: string;
} {
  const productId = String(args.productId ?? args.product_id ?? "").trim();
  const campaignMessage = String(
    args.campaignMessage ?? args.campaign_message ?? "",
  ).trim();
  if (!productId || !campaignMessage) {
    return {
      productId,
      campaignMessage,
      error: "productId and campaignMessage are required",
    };
  }
  return {
    productId,
    campaignMessage,
    campaignGoals: parseStringArray(args.campaignGoals ?? args.campaign_goals),
    targetAudience:
      String(args.targetAudience ?? args.target_audience ?? "").trim() || undefined,
    preferredPlatform:
      String(args.preferredPlatform ?? args.preferred_platform ?? "").trim() ||
      undefined,
    additionalGuidelines:
      String(args.additionalGuidelines ?? args.additional_guidelines ?? "").trim() ||
      undefined,
    references: String(args.references ?? "").trim() || undefined,
  };
}

export function createAmplifyContentPreviewTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_content_preview",
    description:
      "Free preview of a ProductClank Content Campaign (UGC brief). Returns the AI-composed " +
      "proposal and whether the owner can afford the 1000-credit launch. Always preview before launch.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "ProductClank product UUID" },
        campaignMessage: {
          type: "string",
          description: "Brief — what the community should create",
        },
        campaignGoals: {
          type: "string",
          description: 'Optional goals, e.g. "awareness, signups"',
        },
        targetAudience: { type: "string", description: "Who to reach" },
        preferredPlatform: {
          type: "string",
          description: 'e.g. "x" or "farcaster"',
        },
        additionalGuidelines: { type: "string", description: "Extra do's/don'ts" },
        references: { type: "string", description: "Links to include" },
      },
      required: ["productId", "campaignMessage"],
    },
    async execute(args) {
      const parsed = parseContentPayload(args);
      if (parsed.error) return { error: parsed.error };

      const gate = await requireLinkedProfile(options);
      if (!spendProfile(gate)) return gate;

      const payload: Record<string, unknown> = {
        product_id: parsed.productId,
        campaign_message: parsed.campaignMessage,
        dry_run: true,
      };
      if (parsed.campaignGoals?.length) payload.campaign_goals = parsed.campaignGoals;
      if (parsed.targetAudience) payload.target_audience = parsed.targetAudience;
      if (parsed.preferredPlatform) payload.preferred_platform = parsed.preferredPlatform;
      if (parsed.additionalGuidelines) {
        payload.additional_guidelines = parsed.additionalGuidelines;
      }
      if (parsed.references) payload.references = parsed.references;

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        "/agents/campaigns/content",
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "preview_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      return {
        dryRun: true,
        proposal: body.proposal,
        product: body.product,
        creditsRequired: body.credits_required ?? CONTENT_CAMPAIGN_CREDITS,
        creditsAvailable: body.credits_available,
        canAfford: body.can_afford ?? false,
        note:
          "Show the proposal to the operator. Submissions and winners are managed in the " +
          "ProductClank web app. Launch with amplify_content_launch (confirmed=true) if they approve.",
      };
    },
  };
}

export function createAmplifyContentLaunchTool(
  options: AmplifyCampaignToolOptions,
): BrainTool {
  return {
    name: "amplify_content_launch",
    description:
      "Launch a Content Campaign (1000 credits) after amplify_content_preview and operator " +
      "approval. Community creates original content; operator reviews submissions in the web app.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "ProductClank product UUID" },
        campaignMessage: { type: "string", description: "Campaign brief" },
        campaignGoals: { type: "string", description: "Optional comma-separated goals" },
        targetAudience: { type: "string" },
        preferredPlatform: { type: "string" },
        additionalGuidelines: { type: "string" },
        references: { type: "string" },
        confirmed: { type: "boolean", description: "Must be true after preview" },
      },
      required: ["productId", "campaignMessage", "confirmed"],
    },
    async execute(args) {
      if (!isConfirmed(args)) {
        return confirmationRequiredMessage("amplify_content_launch");
      }

      const parsed = parseContentPayload(args);
      if (parsed.error) return { error: parsed.error };

      const gate = await requireLinkedProfile(options);
      const profile = spendProfile(gate);
      if (!profile) return gate;
      if ((profile.credits ?? 0) < CONTENT_CAMPAIGN_CREDITS) {
        return {
          error: "insufficient_credits",
          creditsRequired: CONTENT_CAMPAIGN_CREDITS,
          ownerCredits: profile.credits ?? 0,
        };
      }

      const payload: Record<string, unknown> = {
        product_id: parsed.productId,
        campaign_message: parsed.campaignMessage,
        dry_run: false,
      };
      if (parsed.campaignGoals?.length) payload.campaign_goals = parsed.campaignGoals;
      if (parsed.targetAudience) payload.target_audience = parsed.targetAudience;
      if (parsed.preferredPlatform) payload.preferred_platform = parsed.preferredPlatform;
      if (parsed.additionalGuidelines) {
        payload.additional_guidelines = parsed.additionalGuidelines;
      }
      if (parsed.references) payload.references = parsed.references;

      const { ok, status, body } = await productClankJson<Record<string, unknown>>(
        options,
        "/agents/campaigns/content",
        { method: "POST", body: JSON.stringify(payload) },
      );
      if (!ok || !body || body.success === false) {
        return {
          error: String(body?.error ?? "launch_failed"),
          message: String(body?.message ?? `HTTP ${status}`),
        };
      }

      const campaign = (body.campaign ?? {}) as Record<string, unknown>;
      const credits = (body.credits ?? {}) as Record<string, unknown>;
      const nextStep = (body.next_step ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        campaign: {
          campaignId: campaign.id,
          number: campaign.campaign_number ?? campaign.campaignNumber,
          title: campaign.title,
          status: campaign.status,
          adminUrl: campaign.admin_url ?? campaign.adminUrl ?? nextStep.admin_url,
        },
        creditsUsed: credits.credits_used ?? credits.creditsUsed,
        creditsRemaining: credits.credits_remaining ?? credits.creditsRemaining,
        note:
          "Campaign is live — operator reviews community submissions and picks winners in the " +
          "ProductClank web app (admin URL above).",
      };
    },
  };
}
