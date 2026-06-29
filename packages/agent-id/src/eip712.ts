import { CELO_CHAIN_ID } from "@g-copilot/shared";
import type { Address } from "viem";

export const AGENT_ID_DOMAIN_NAME = "GoodDollar Agent ID";
export const AGENT_ID_DOMAIN_VERSION = "1";

/**
 * Default `verifyingContract` for off-chain-only credentials (no on-chain anchor
 * yet). Phase E replaces this with the deployed AgentVault address.
 */
export const OFFCHAIN_VERIFYING_CONTRACT =
  "0x0000000000000000000000000000000000000000" as const;

/** EIP-712 field definitions for the `AgentID` struct (order matters). */
export const agentIdTypes = {
  AgentID: [
    { name: "agent", type: "address" },
    { name: "operator", type: "address" },
    { name: "humanRoot", type: "address" },
    { name: "scopes", type: "string" },
    { name: "stake", type: "uint256" },
    { name: "budgetCap", type: "uint256" },
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
