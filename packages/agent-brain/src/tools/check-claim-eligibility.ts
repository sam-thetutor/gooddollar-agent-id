import {
  getClaimEligibility,
  type ClaimEligibilityResult,
} from "@goodagent/chain";
import type { BrainTool } from "../types.js";

/**
 * `check_claim_eligibility` — reads GoodDollar UBIScheme + Identity on Celo
 * to tell a user whether a wallet can claim UBI today and how much.
 */
export interface CheckClaimEligibilityToolOptions {
  /** Injectable for tests; defaults to the live Celo read. */
  lookup?: (wallet: string) => Promise<ClaimEligibilityResult>;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function createCheckClaimEligibilityTool(
  options: CheckClaimEligibilityToolOptions = {},
): BrainTool {
  const lookup = options.lookup ?? getClaimEligibility;

  return {
    name: "check_claim_eligibility",
    description:
      "Check whether a wallet address can claim GoodDollar UBI (G$) today on Celo. " +
      "Returns whether the wallet is GoodID-whitelisted, whether there is an unclaimed " +
      "entitlement, and the claimable G$ amount.",
    parameters: {
      type: "object",
      properties: {
        wallet: {
          type: "string",
          description: "The 0x-prefixed wallet address to check.",
        },
      },
      required: ["wallet"],
    },
    async execute(args) {
      const wallet = typeof args.wallet === "string" ? args.wallet.trim() : "";
      if (!ADDRESS_RE.test(wallet)) {
        return {
          error: "Invalid wallet — expected a 0x-prefixed 40-hex-char address.",
        };
      }
      return lookup(wallet);
    },
  };
}
