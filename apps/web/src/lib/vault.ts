// AgentVault wiring for the web app. The vault address is injected at build
// time via VITE_AGENT_VAULT_ADDRESS once packages/contracts is deployed; until
// then the management UI renders a "not yet deployed" notice.

import { isAddress } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000";

const rawVault = import.meta.env.VITE_AGENT_VAULT_ADDRESS as
  | string
  | undefined;

// Only accept a well-formed, non-zero address; anything else disables staking
// UI rather than letting a malformed address reach a contract call.
export const VAULT_ADDRESS: `0x${string}` | null =
  rawVault && rawVault !== ZERO && isAddress(rawVault)
    ? (rawVault as `0x${string}`)
    : null;

export function isVaultConfigured(): boolean {
  return VAULT_ADDRESS !== null;
}

/** G$ token on Celo mainnet (18 decimals). */
export const G_DOLLAR_ADDRESS =
  "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as const;

export const G_DOLLAR_DECIMALS = 18;

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
    name: "requestUnstake",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawStake",
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
