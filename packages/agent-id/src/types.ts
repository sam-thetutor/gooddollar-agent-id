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
  // The live G$ bond behind the agent was withdrawn / is below the vault
  // minimum (only when the verifier supplies a `stakeLookup`):
  | "insufficient_bond"
  // The operator flagged the agent as revoked on-chain in the AgentRevocation
  // registry (only when the verifier supplies a `revocationLookup`):
  | "revoked"
  // ERC-8004 registration-file verification (see erc8004.ts):
  | "no_gooddollar_proof"
  | "bad_credential";

/**
 * Result of verifying an Agent ID credential. The core checks are identity
 * (signature, expiry, live human root). When the verifier supplies a
 * `stakeLookup`, the live G$ bond is also enforced: a bond below the vault
 * minimum fails verification with `insufficient_bond` — withdrawing the bond
 * un-verifies the agent until it is re-staked.
 */
export interface VerifyResult {
  valid: boolean;
  reason?: VerifyFailureReason;
  operator?: Address;
  humanRoot?: Address;
  expiresAt?: bigint;
  /** Live G$ bond behind the agent (base units); set when a stakeLookup ran. */
  stake?: bigint;
  /** Vault minimum bond (base units); set when a stakeLookup ran. */
  minStake?: bigint;
  /**
   * Whether the live G$ bond was actually read and enforced. `false` means the
   * verifier ran an identity-only check (no `stakeLookup`) — a valid verdict
   * then says nothing about the bond. Always present so a skipped bond check is
   * explicit, never silent.
   */
  bondChecked: boolean;
  /**
   * Whether the on-chain revocation registry was consulted. `false` means no
   * `revocationLookup` was supplied, so a valid verdict does not account for a
   * possible operator revocation.
   */
  revocationChecked: boolean;
  /**
   * Whether the agent has proven on-chain (AgentAttestation registry) that it
   * controls its own key. Informational — it does not gate validity, but
   * careful verifiers should prefer `agentProven: true`. Only set when the
   * verifier read the attestation registry (e.g. via `verifyAgentIdLive`).
   */
  agentProven?: boolean;
  /** Unix seconds of the agent's first on-chain attestation (when proven). */
  agentProvenAt?: bigint;
}
