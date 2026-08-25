import type { BrainTool } from "../types.js";
import {
  createVerifyAddressTool,
  type VerifyAddressToolOptions,
} from "./verify-address.js";
import {
  createCheckClaimEligibilityTool,
  type CheckClaimEligibilityToolOptions,
} from "./check-claim-eligibility.js";
import {
  createAgentStatsTool,
  type AgentStatsToolOptions,
} from "./agent-stats.js";
import {
  createAmplifyPendingTool,
  createAmplifyMarkPostedTool,
  createAmplifyFeedTool,
  createAmplifyCampaignsTool,
  createAmplifyCampaignDraftsTool,
  createAmplifyEarningsTool,
  type AmplifyToolOptions,
  type AmplifyApiToolOptions,
  type AmplifyCampaignsToolOptions,
  type AmplifyCampaignDraftsToolOptions,
} from "./amplify.js";
import {
  createAmplifyAccountTool,
  createAmplifyProductsSearchTool,
  createAmplifyBoostPreviewTool,
  createAmplifyBoostPostTool,
  type AmplifyCampaignToolOptions,
} from "./amplify-campaigns.js";
import {
  createAmplifyMyCampaignsTool,
  createAmplifyCampaignDetailTool,
  createAmplifyCampaignPostsTool,
  createAmplifyProductsListTool,
  createAmplifyDiscoverPreviewTool,
  createAmplifyDiscoverCreateTool,
  createAmplifyDiscoverResearchTool,
  createAmplifyDiscoverGeneratePreviewTool,
  createAmplifyDiscoverGenerateTool,
} from "./amplify-discover.js";
import {
  createAmplifyContentPreviewTool,
  createAmplifyContentLaunchTool,
} from "./amplify-content.js";
import {
  createAmplifyCreditsHistoryTool,
  createAmplifyCampaignDelegateTool,
  createAmplifyDiscoverRegeneratePreviewTool,
  createAmplifyDiscoverRegenerateTool,
  createAmplifyDiscoverReviewPreviewTool,
  createAmplifyDiscoverReviewTool,
} from "./amplify-campaign-admin.js";
import {
  createSearchFixturesTool,
  createRecommendMatchesTool,
  createBuildBestSlipTool,
  createBookSelectionsTool,
  type KasukuCatalogToolOptions,
} from "./kasuku.js";

export { createVerifyAddressTool, type VerifyAddressToolOptions };
export { createCheckClaimEligibilityTool, type CheckClaimEligibilityToolOptions };
export { createAgentStatsTool, type AgentStatsToolOptions };
export {
  createAmplifyPendingTool,
  createAmplifyMarkPostedTool,
  createAmplifyFeedTool,
  createAmplifyCampaignsTool,
  createAmplifyCampaignDraftsTool,
  createAmplifyEarningsTool,
  type AmplifyToolOptions,
  type AmplifyApiToolOptions,
  type AmplifyCampaignsToolOptions,
  type AmplifyCampaignDraftsToolOptions,
};
export {
  createAmplifyAccountTool,
  createAmplifyProductsSearchTool,
  createAmplifyBoostPreviewTool,
  createAmplifyBoostPostTool,
  type AmplifyCampaignToolOptions,
};
export {
  createAmplifyMyCampaignsTool,
  createAmplifyCampaignDetailTool,
  createAmplifyCampaignPostsTool,
  createAmplifyProductsListTool,
  createAmplifyDiscoverPreviewTool,
  createAmplifyDiscoverCreateTool,
  createAmplifyDiscoverResearchTool,
  createAmplifyDiscoverGeneratePreviewTool,
  createAmplifyDiscoverGenerateTool,
};
export {
  createAmplifyContentPreviewTool,
  createAmplifyContentLaunchTool,
};
export {
  createAmplifyCreditsHistoryTool,
  createAmplifyCampaignDelegateTool,
  createAmplifyDiscoverRegeneratePreviewTool,
  createAmplifyDiscoverRegenerateTool,
  createAmplifyDiscoverReviewPreviewTool,
  createAmplifyDiscoverReviewTool,
};
export {
  createSearchFixturesTool,
  createRecommendMatchesTool,
  createBuildBestSlipTool,
  createBookSelectionsTool,
  type KasukuCatalogToolOptions,
};

export interface BuiltinToolOptions {
  apiBase: string;
  /** Required for the `agent_stats` tool. */
  hostUrl?: string;
  deployId?: string;
  /** Required for the `amplify_pending`/`amplify_mark_posted` tools. */
  amplifyQueueFile?: string;
  /** Required for the `amplify_feed`/`amplify_earnings` tools. */
  productClankApiKey?: string;
  /** Required for Kasuku catalog tools. */
  hostInternalSecret?: string;
  fetchImpl?: typeof fetch;
}

function createKasukuTool(
  factory: (opts: KasukuCatalogToolOptions) => BrainTool,
  options: BuiltinToolOptions,
): BrainTool {
  if (!options.hostUrl || !options.hostInternalSecret) {
    throw new Error(
      "Kasuku catalog tools require GOODAGENT_HOST_URL and HOST_INTERNAL_SECRET",
    );
  }
  return factory({
    hostUrl: options.hostUrl,
    hostInternalSecret: options.hostInternalSecret,
    fetchImpl: options.fetchImpl,
  });
}

function registerSpendTool(
  name: string,
  factory: () => BrainTool,
  options: BuiltinToolOptions,
  factories: Record<string, () => BrainTool>,
): void {
  factories[name] = () => {
    if (!options.productClankApiKey) {
      throw new Error(`${name} tool requires PRODUCTCLANK_API_KEY (productClankApiKey)`);
    }
    return factory();
  };
}

/** Factory registry so manifests can enable tools by name. */
export function createBuiltinTools(
  names: string[],
  options: BuiltinToolOptions,
): BrainTool[] {
  const pcOpts = {
    apiKey: options.productClankApiKey ?? "",
    fetchImpl: options.fetchImpl,
  };
  const factories: Record<string, () => BrainTool> = {
    verify_address: () =>
      createVerifyAddressTool({
        apiBase: options.apiBase,
        fetchImpl: options.fetchImpl,
      }),
    check_claim_eligibility: () => createCheckClaimEligibilityTool(),
    agent_stats: () => {
      if (!options.hostUrl || !options.deployId) {
        throw new Error(
          "agent_stats tool requires GOODAGENT_HOST_URL and DEPLOY_ID (hostUrl/deployId)",
        );
      }
      return createAgentStatsTool({
        hostUrl: options.hostUrl,
        deployId: options.deployId,
        fetchImpl: options.fetchImpl,
      });
    },
    amplify_pending: () => {
      if (!options.amplifyQueueFile) {
        throw new Error(
          "amplify_pending tool requires AMPLIFY_QUEUE_FILE (amplifyQueueFile)",
        );
      }
      return createAmplifyPendingTool({ queueFile: options.amplifyQueueFile });
    },
    amplify_mark_posted: () => {
      if (!options.amplifyQueueFile) {
        throw new Error(
          "amplify_mark_posted tool requires AMPLIFY_QUEUE_FILE (amplifyQueueFile)",
        );
      }
      return createAmplifyMarkPostedTool({
        queueFile: options.amplifyQueueFile,
      });
    },
    amplify_feed: () => {
      if (!options.productClankApiKey) {
        throw new Error(
          "amplify_feed tool requires PRODUCTCLANK_API_KEY (productClankApiKey)",
        );
      }
      return createAmplifyFeedTool({
        apiKey: options.productClankApiKey,
        fetchImpl: options.fetchImpl,
      });
    },
    amplify_campaigns: () =>
      createAmplifyCampaignsTool({
        apiKey: options.productClankApiKey,
        fetchImpl: options.fetchImpl,
      }),
    amplify_campaign_drafts: () => {
      if (!options.amplifyQueueFile) {
        throw new Error(
          "amplify_campaign_drafts tool requires AMPLIFY_QUEUE_FILE (amplifyQueueFile)",
        );
      }
      return createAmplifyCampaignDraftsTool({
        queueFile: options.amplifyQueueFile,
        apiKey: options.productClankApiKey,
        fetchImpl: options.fetchImpl,
      });
    },
    amplify_earnings: () => {
      if (!options.productClankApiKey) {
        throw new Error(
          "amplify_earnings tool requires PRODUCTCLANK_API_KEY (productClankApiKey)",
        );
      }
      return createAmplifyEarningsTool({
        apiKey: options.productClankApiKey,
        fetchImpl: options.fetchImpl,
      });
    },
    amplify_boost_post: () => {
      if (!options.productClankApiKey) {
        throw new Error(
          "amplify_boost_post tool requires PRODUCTCLANK_API_KEY (productClankApiKey)",
        );
      }
      return createAmplifyBoostPostTool({
        apiKey: options.productClankApiKey,
        fetchImpl: options.fetchImpl,
      });
    },
    search_fixtures: () => createKasukuTool(createSearchFixturesTool, options),
    recommend_matches: () => createKasukuTool(createRecommendMatchesTool, options),
    build_best_slip: () => createKasukuTool(createBuildBestSlipTool, options),
    book_selections: () => createKasukuTool(createBookSelectionsTool, options),
  };

  registerSpendTool(
    "amplify_account",
    () => createAmplifyAccountTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_products_search",
    () => createAmplifyProductsSearchTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_boost_preview",
    () => createAmplifyBoostPreviewTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_my_campaigns",
    () => createAmplifyMyCampaignsTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_campaign_detail",
    () => createAmplifyCampaignDetailTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_campaign_posts",
    () => createAmplifyCampaignPostsTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_products_list",
    () => createAmplifyProductsListTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_discover_preview",
    () => createAmplifyDiscoverPreviewTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_discover_create",
    () => createAmplifyDiscoverCreateTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_discover_research",
    () => createAmplifyDiscoverResearchTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_discover_generate_preview",
    () => createAmplifyDiscoverGeneratePreviewTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_discover_generate",
    () => createAmplifyDiscoverGenerateTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_content_preview",
    () => createAmplifyContentPreviewTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_content_launch",
    () => createAmplifyContentLaunchTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_credits_history",
    () => createAmplifyCreditsHistoryTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_campaign_delegate",
    () => createAmplifyCampaignDelegateTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_discover_regenerate_preview",
    () => createAmplifyDiscoverRegeneratePreviewTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_discover_regenerate",
    () => createAmplifyDiscoverRegenerateTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_discover_review_preview",
    () => createAmplifyDiscoverReviewPreviewTool(pcOpts),
    options,
    factories,
  );
  registerSpendTool(
    "amplify_discover_review",
    () => createAmplifyDiscoverReviewTool(pcOpts),
    options,
    factories,
  );

  return names.map((name) => {
    const factory = factories[name];
    if (!factory) {
      throw new Error(
        `Unknown brain tool "${name}". Available: ${Object.keys(factories).join(", ")}`,
      );
    }
    return factory();
  });
}
