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

/**
 * EIP-712 field definitions for the `AgentAuth` struct (order matters).
 *
 * An `AgentAuth` is signed by the **agent's own key** to prove *possession* of
 * the agent address at request time. The identity credential (`AgentID`) says a
 * human vouches for an agent address; it says nothing about who is presenting
 * it. Because credentials are public, anyone could replay one and impersonate
 * the agent. Requiring a fresh, agent-signed `AgentAuth` closes that: only the
 * holder of the agent key can produce it.
 *
 * - `audience` binds the proof to a specific verifier/service so it can't be
 *   replayed against a different one (use the service's name/origin; "" = any).
 * - `issuedAt` + a max-age check gives freshness (a captured auth expires).
 */
export const agentAuthTypes = {
  AgentAuth: [
    { name: "agent", type: "address" },
    { name: "audience", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "issuedAt", type: "uint64" },
  ],
} as const;

export const AGENT_AUTH_PRIMARY_TYPE = "AgentAuth" as const;

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
