import { CELO_CHAIN_ID } from "@goodagent/shared";
import type { Address } from "viem";

/** Off-chain-only credentials use the zero address as verifyingContract. */
export const OFFCHAIN_VERIFYING_CONTRACT =
  "0x0000000000000000000000000000000000000000" as const;

export const agentIdDomain = {
  name: "GoodDollar Agent ID",
  version: "1",
  chainId: CELO_CHAIN_ID,
  verifyingContract: OFFCHAIN_VERIFYING_CONTRACT,
} as const;

/** EIP-712 field layout — must match packages/agent-id/src/eip712.ts. */
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

export interface AgentIdMessage {
  agent: Address;
  operator: Address;
  humanRoot: Address;
  nonce: bigint;
  issuedAt: bigint;
  expiresAt: bigint;
}

export interface BuildMessageInput {
  agent: Address;
  operator: Address;
  humanRoot: Address;
  ttlDays?: number;
}

export function buildAgentIdMessage(input: BuildMessageInput): AgentIdMessage {
  const issuedAt = BigInt(Math.floor(Date.now() / 1000));
  const ttl = BigInt((input.ttlDays ?? 30) * 86_400);
  return {
    agent: input.agent,
    operator: input.operator,
    humanRoot: input.humanRoot,
    // Monotonic per-issue nonce (issue time in seconds). The API rejects a
    // re-issue whose nonce isn't strictly greater than the stored one, so an
    // old signed credential can't be replayed to overwrite or un-revoke a
    // newer registration.
    nonce: issuedAt,
    issuedAt,
    expiresAt: issuedAt + ttl,
  };
}

/** EIP-712 types for a revocation the operator signs (must match the API). */
export const revokeTypes = {
  RevokeAgentID: [
    { name: "agent", type: "address" },
    { name: "operator", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export interface RevokeMessage {
  agent: Address;
  operator: Address;
  nonce: bigint;
}

export function buildRevokeMessage(
  agent: Address,
  operator: Address,
): RevokeMessage {
  return { agent, operator, nonce: BigInt(Math.floor(Date.now() / 1000)) };
}

/** Convert a signing message into the JSON-safe wire form the API expects. */
export function messageToWire(m: AgentIdMessage) {
  return {
    agent: m.agent,
    operator: m.operator,
    humanRoot: m.humanRoot,
    nonce: m.nonce.toString(),
    issuedAt: m.issuedAt.toString(),
    expiresAt: m.expiresAt.toString(),
  };
}
