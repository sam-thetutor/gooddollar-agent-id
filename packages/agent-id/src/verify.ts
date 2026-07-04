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

/**
 * Resolves whether the agent is currently revoked on-chain (AgentRevocation
 * registry). Re-read on every verify so an operator revocation is honored by
 * every verifier, not just those routed through the issuing API.
 */
export type RevocationLookup = (
  agent: Address,
) => Promise<boolean> | boolean;

export interface VerifyOptions {
  /** Current time in unix seconds. Defaults to now. */
  now?: bigint;
  /** Live GoodDollar root lookup (see {@link HumanRootLookup}). */
  humanRootLookup: HumanRootLookup;
  /**
   * Live G$ bond lookup (see {@link StakeLookup}). When provided, a bond below
   * the vault minimum fails verification with `insufficient_bond`. When omitted,
   * the result carries `bondChecked: false` so the skipped check is explicit.
   *
   * Prefer {@link verifyAgentIdLive} (in chain-lookup) which wires this on by
   * default against Celo mainnet.
   */
  stakeLookup?: StakeLookup;
  /**
   * Live on-chain revocation lookup (see {@link RevocationLookup}). When
   * provided, a revoked agent fails with `revoked`. When omitted, the result
   * carries `revocationChecked: false`.
   */
  revocationLookup?: RevocationLookup;
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
 *   4. that live root matches the one in the credential,
 *   5. (when a `revocationLookup` is provided) the agent isn't revoked on-chain,
 *   6. (when a `stakeLookup` is provided) the agent's live G$ bond still meets
 *      the vault minimum — a withdrawn bond fails with `insufficient_bond`.
 *
 * `bondChecked` / `revocationChecked` are always present on the result so a
 * caller can tell whether those live checks actually ran.
 *
 * NOTE: a valid result proves a human vouches for the agent address — it does
 * NOT prove the caller controls that address. For counterparty authentication,
 * additionally require a fresh agent-signed {@link AgentAuth} (see agent-auth).
 */
export async function verifyAgentId(
  credential: AgentIdCredential,
  opts: VerifyOptions,
): Promise<VerifyResult> {
  const { fields, signature, chainId, verifyingContract } = credential;
  const now = opts.now ?? nowSeconds();
  const bondChecked = false;
  const revocationChecked = false;

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
    return { valid: false, reason: "bad_signature", bondChecked, revocationChecked };
  }
  if (!isAddressEqual(recovered, fields.operator)) {
    return {
      valid: false,
      reason: "signature_mismatch",
      bondChecked,
      revocationChecked,
    };
  }

  // 2. Not expired.
  if (now >= fields.expiresAt) {
    return {
      valid: false,
      reason: "expired",
      operator: fields.operator,
      expiresAt: fields.expiresAt,
      bondChecked,
      revocationChecked,
    };
  }

  // 3. Operator is a verified human right now.
  const liveRoot = await opts.humanRootLookup(fields.operator);
  if (isZeroRoot(liveRoot)) {
    return {
      valid: false,
      reason: "operator_not_verified",
      operator: fields.operator,
      bondChecked,
      revocationChecked,
    };
  }

  // 4. Live root matches the credential's root.
  if (!isAddressEqual(liveRoot as Address, fields.humanRoot)) {
    return {
      valid: false,
      reason: "human_root_mismatch",
      operator: fields.operator,
      bondChecked,
      revocationChecked,
    };
  }

  // 5. Not revoked on-chain (when the verifier supplies a revocation lookup).
  let didCheckRevocation = false;
  if (opts.revocationLookup) {
    const revoked = await opts.revocationLookup(fields.agent);
    didCheckRevocation = true;
    if (revoked) {
      return {
        valid: false,
        reason: "revoked",
        operator: fields.operator,
        humanRoot: fields.humanRoot,
        expiresAt: fields.expiresAt,
        bondChecked,
        revocationChecked: true,
      };
    }
  }

  // 6. Live G$ bond still meets the vault minimum (when the verifier cares).
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
        bondChecked: true,
        revocationChecked: didCheckRevocation,
      };
    }
    return {
      valid: true,
      operator: fields.operator,
      humanRoot: fields.humanRoot,
      expiresAt: fields.expiresAt,
      stake,
      minStake,
      bondChecked: true,
      revocationChecked: didCheckRevocation,
    };
  }

  return {
    valid: true,
    operator: fields.operator,
    humanRoot: fields.humanRoot,
    expiresAt: fields.expiresAt,
    bondChecked,
    revocationChecked: didCheckRevocation,
  };
}
