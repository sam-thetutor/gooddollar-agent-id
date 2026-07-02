import {
  isAddressEqual,
  recoverTypedDataAddress,
  zeroAddress,
  type Address,
} from "viem";
import {
  AGENT_ID_PRIMARY_TYPE,
  agentIdDomain,
  agentIdTypes,
} from "./eip712.js";
import type { AgentIdCredential, VerifyResult } from "./types.js";

/**
 * Resolves an operator's *current* GoodDollar root (`getWhitelistedRoot`), or
 * null/zero if they're not verified right now. This is re-read on every verify
 * so credentials track live human-ness.
 */
export type HumanRootLookup = (
  operator: Address,
) => Promise<Address | null> | Address | null;

/**
 * Resolves the agent's *current* G$ bond in the AgentVault: the live stake and
 * the vault's minimum. Re-read on every verify so withdrawing the bond
 * un-verifies the agent until it is re-staked.
 */
export type StakeLookup = (
  agent: Address,
) => Promise<{ stake: bigint; minStake: bigint }> | {
  stake: bigint;
  minStake: bigint;
};

export interface VerifyOptions {
  /** Current time in unix seconds. Defaults to now. */
  now?: bigint;
  /** Live GoodDollar root lookup (see {@link HumanRootLookup}). */
  humanRootLookup: HumanRootLookup;
  /**
   * Live G$ bond lookup (see {@link StakeLookup}). When provided, a bond below
   * the vault minimum fails verification with `insufficient_bond`.
   */
  stakeLookup?: StakeLookup;
}

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

function isZeroRoot(root: Address | null): boolean {
  return !root || isAddressEqual(root, zeroAddress);
}

/**
 * Verify an Agent ID credential. Checks, in order:
 *   1. the signature recovers to `operator`,
 *   2. the credential hasn't expired,
 *   3. the operator is a verified human *now*,
 *   4. that live root matches the one in the credential, and
 *   5. (when a `stakeLookup` is provided) the agent's live G$ bond still meets
 *      the vault minimum — a withdrawn bond fails with `insufficient_bond`.
 */
export async function verifyAgentId(
  credential: AgentIdCredential,
  opts: VerifyOptions,
): Promise<VerifyResult> {
  const { fields, signature, chainId, verifyingContract } = credential;
  const now = opts.now ?? nowSeconds();

  // 1. Signature recovers to the claimed operator.
  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      domain: agentIdDomain({ chainId, verifyingContract }),
      types: agentIdTypes,
      primaryType: AGENT_ID_PRIMARY_TYPE,
      message: fields,
      signature,
    });
  } catch {
    return { valid: false, reason: "bad_signature" };
  }
  if (!isAddressEqual(recovered, fields.operator)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  // 2. Not expired.
  if (now >= fields.expiresAt) {
    return {
      valid: false,
      reason: "expired",
      operator: fields.operator,
      expiresAt: fields.expiresAt,
    };
  }

  // 3. Operator is a verified human right now.
  const liveRoot = await opts.humanRootLookup(fields.operator);
  if (isZeroRoot(liveRoot)) {
    return {
      valid: false,
      reason: "operator_not_verified",
      operator: fields.operator,
    };
  }

  // 4. Live root matches the credential's root.
  if (!isAddressEqual(liveRoot as Address, fields.humanRoot)) {
    return {
      valid: false,
      reason: "human_root_mismatch",
      operator: fields.operator,
    };
  }

  // 5. Live G$ bond still meets the vault minimum (when the verifier cares).
  if (opts.stakeLookup) {
    const { stake, minStake } = await opts.stakeLookup(fields.agent);
    if (stake < minStake) {
      return {
        valid: false,
        reason: "insufficient_bond",
        operator: fields.operator,
        humanRoot: fields.humanRoot,
        expiresAt: fields.expiresAt,
        stake,
        minStake,
      };
    }
    return {
      valid: true,
      operator: fields.operator,
      humanRoot: fields.humanRoot,
      expiresAt: fields.expiresAt,
      stake,
      minStake,
    };
  }

  return {
    valid: true,
    operator: fields.operator,
    humanRoot: fields.humanRoot,
    expiresAt: fields.expiresAt,
  };
}
