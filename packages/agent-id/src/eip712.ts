import type { Address } from "viem";

export const AGENT_ID_DOMAIN_NAME = "GoodDollar Agent ID";
export const AGENT_ID_DOMAIN_VERSION = "1";

/** Celo mainnet chain id (default EIP-712 domain chain). */
export const CELO_CHAIN_ID = 42220;

/**
 * Default `verifyingContract` for the EIP-712 domain. The Agent ID credential is
 * a pure *identity* statement and is not bound to a specific contract, so it uses
 * the zero address by default; callers may override via {@link DomainOptions}.
 */
export const OFFCHAIN_VERIFYING_CONTRACT =
  "0x0000000000000000000000000000000000000000" as const;

/**
 * EIP-712 field definitions for the `AgentID` struct (order matters).
 *
 * The credential is **identity-only**: it states that a GoodDollar-verified human
 * (`operator`, with root `humanRoot`) vouches for `agent` until `expiresAt`.
 * It carries no capability or money fields — the required G$ bond lives on-chain
 * in the AgentVault and is read live at verify time.
 */
export const agentIdTypes = {
  AgentID: [
    { name: "agent", type: "address" },
    { name: "operator", type: "address" },
    { name: "humanRoot", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

export const AGENT_ID_PRIMARY_TYPE = "AgentID" as const;

export interface DomainOptions {
  chainId?: number;
  verifyingContract?: Address;
}

/** Build the EIP-712 domain used to sign/verify Agent ID credentials. */
export function agentIdDomain(opts?: DomainOptions) {
  return {
    name: AGENT_ID_DOMAIN_NAME,
    version: AGENT_ID_DOMAIN_VERSION,
    chainId: opts?.chainId ?? CELO_CHAIN_ID,
    verifyingContract: opts?.verifyingContract ?? OFFCHAIN_VERIFYING_CONTRACT,
  } as const;
}
