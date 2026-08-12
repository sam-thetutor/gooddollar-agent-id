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

export { createVerifyAddressTool, type VerifyAddressToolOptions };
export { createCheckClaimEligibilityTool, type CheckClaimEligibilityToolOptions };
export { createAgentStatsTool, type AgentStatsToolOptions };

export interface BuiltinToolOptions {
  apiBase: string;
  /** Required for the `agent_stats` tool. */
  hostUrl?: string;
  deployId?: string;
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
