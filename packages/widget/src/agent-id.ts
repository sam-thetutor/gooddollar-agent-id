import { CELO_CHAIN_ID } from "./public-urls.js";
import type { Address } from "viem";

export const AGENT_VAULT_ADDRESS =
  "0x0409042B55e99Df8c0Feb7525A770838f3A47090" as const;

export const AGENT_ATTESTATION_ADDRESS =
  "0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2" as const;

export const G_DOLLAR_ADDRESS =
  "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as const;

export const G_DOLLAR_DECIMALS = 18;

export const agentAttestationAbi = [
  {
    type: "function",
    name: "provenAt",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const agentVaultAbi = [
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "operator", type: "address" },
      { name: "stakeAmount", type: "uint256" },
      { name: "unlockAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const OFFCHAIN_VERIFYING_CONTRACT =
  "0x0000000000000000000000000000000000000000" as const;

export const agentIdDomain = {
  name: "GoodDollar Agent ID",
  version: "1",
  chainId: CELO_CHAIN_ID,
  verifyingContract: OFFCHAIN_VERIFYING_CONTRACT,
} as const;

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

export function buildAgentIdMessage(input: {
  agent: Address;
  operator: Address;
  humanRoot: Address;
  ttlDays?: number;
}): AgentIdMessage {
  const issuedAt = BigInt(Math.floor(Date.now() / 1000));
  const ttl = BigInt((input.ttlDays ?? 30) * 86_400);
  return {
    agent: input.agent,
    operator: input.operator,
    humanRoot: input.humanRoot,
    nonce: issuedAt,
    issuedAt,
    expiresAt: issuedAt + ttl,
  };
}

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
