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
  type AmplifyToolOptions,
} from "./amplify.js";

export { createVerifyAddressTool, type VerifyAddressToolOptions };
export { createCheckClaimEligibilityTool, type CheckClaimEligibilityToolOptions };
export { createAgentStatsTool, type AgentStatsToolOptions };
export {
  createAmplifyPendingTool,
  createAmplifyMarkPostedTool,
  type AmplifyToolOptions,
};

export interface BuiltinToolOptions {
  apiBase: string;
  /** Required for the `agent_stats` tool. */
  hostUrl?: string;
  deployId?: string;
  /** Required for the `amplify_*` tools (path to amplify-queue.json). */
  amplifyQueueFile?: string;
  fetchImpl?: typeof fetch;
}

/** Factory registry so manifests can enable tools by name. */
export function createBuiltinTools(
  names: string[],
  options: BuiltinToolOptions,
): BrainTool[] {
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
  };

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
