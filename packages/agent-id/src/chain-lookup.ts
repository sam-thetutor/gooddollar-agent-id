import { getVerifyStatus } from "@g-copilot/chain";
import type { Address } from "viem";
import type { HumanRootLookup } from "./verify.js";

/**
 * Default {@link HumanRootLookup} backed by the live GoodDollar Identity contract
 * on Celo. Returns the operator's whitelisted root, or null if not verified.
 */
export const liveHumanRootLookup: HumanRootLookup = async (
  operator: Address,
): Promise<Address | null> => {
  const status = await getVerifyStatus(operator);
  return (status.root as Address | null) ?? null;
};
