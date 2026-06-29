import { CELO_CHAIN_ID } from "@g-copilot/shared";
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
    { name: "scopes", type: "string" },
    { name: "stake", type: "uint256" },
    { name: "budgetCap", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

export interface AgentIdMessage {
  agent: Address;
  operator: Address;
  humanRoot: Address;
  scopes: string;
  stake: bigint;
  budgetCap: bigint;
  nonce: bigint;
  issuedAt: bigint;
  expiresAt: bigint;
}

export interface BuildMessageInput {
  agent: Address;
  operator: Address;
  humanRoot: Address;
  scopes: string;
  stake?: bigint;
  budgetCap?: bigint;
  ttlDays?: number;
}

export function buildAgentIdMessage(input: BuildMessageInput): AgentIdMessage {
  const issuedAt = BigInt(Math.floor(Date.now() / 1000));
  const ttl = BigInt((input.ttlDays ?? 30) * 86_400);
  return {
    agent: input.agent,
    operator: input.operator,
    humanRoot: input.humanRoot,
    scopes: input.scopes,
    stake: input.stake ?? 0n,
    budgetCap: input.budgetCap ?? 0n,
    nonce: 0n,
    issuedAt,
    expiresAt: issuedAt + ttl,
  };
}

/** Convert a signing message into the JSON-safe wire form the API expects. */
export function messageToWire(m: AgentIdMessage) {
  return {
    agent: m.agent,
    operator: m.operator,
    humanRoot: m.humanRoot,
    scopes: m.scopes,
    stake: m.stake.toString(),
    budgetCap: m.budgetCap.toString(),
    nonce: m.nonce.toString(),
    issuedAt: m.issuedAt.toString(),
    expiresAt: m.expiresAt.toString(),
  };
}
