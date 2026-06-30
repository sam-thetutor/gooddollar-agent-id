import type { Address, Hex } from "viem";

/**
 * The signed statement an operator (a GoodDollar-verified human) makes about an
 * AI agent. Mirrors the EIP-712 `AgentID` struct (see docs/14-agent-id-spec.md §2).
 *
 * `humanRoot` is the operator's GoodDollar whitelisted root (an address returned
 * by `getWhitelistedRoot`). Re-checking it live is what makes the credential
 * auto-invalidate when the human's verification lapses.
 */
export interface AgentIdFields {
  /** The agent's address. */
  agent: Address;
  /** The human operator's wallet (must be GoodDollar-whitelisted). */
  operator: Address;
  /** Operator's GoodDollar root at issuance (`getWhitelistedRoot`). */
  humanRoot: Address;
  /** Per-operator nonce; prevents replay / enables revocation. */
  nonce: bigint;
  /** Unix seconds when issued. */
  issuedAt: bigint;
  /** Unix seconds hard expiry. */
  expiresAt: bigint;
}

/**
 * A portable, signed Agent ID credential. The `chainId` + `verifyingContract`
 * are the EIP-712 domain values used at signing time and are required to verify.
 */
export interface AgentIdCredential {
  fields: AgentIdFields;
  signature: Hex;
  chainId: number;
  verifyingContract: Address;
}

/** Reason codes returned by {@link AgentIdFields} verification when invalid. */
export type VerifyFailureReason =
  | "bad_signature"
  | "signature_mismatch"
  | "expired"
  | "operator_not_verified"
  | "human_root_mismatch"
  // ERC-8004 registration-file verification (see erc8004.ts):
  | "no_gooddollar_proof"
  | "bad_credential";

/**
 * Result of verifying an Agent ID credential. This is the *identity* verdict;
 * any optional on-chain G$ stake is read separately (see `packages/chain`'s
 * `getAgentVaultStatus`) and merged in by callers that care about the bond.
 */
export interface VerifyResult {
  valid: boolean;
  reason?: VerifyFailureReason;
  operator?: Address;
  humanRoot?: Address;
  expiresAt?: bigint;
}
