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

export interface VerifyOptions {
  /** Current time in unix seconds. Defaults to now. */
  now?: bigint;
  /** Live GoodDollar root lookup (see {@link HumanRootLookup}). */
  humanRootLookup: HumanRootLookup;
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
 *   3. the operator is a verified human *now*, and
 *   4. that live root matches the one in the credential.
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

  return {
    valid: true,
    operator: fields.operator,
    humanRoot: fields.humanRoot,
    expiresAt: fields.expiresAt,
  };
}
