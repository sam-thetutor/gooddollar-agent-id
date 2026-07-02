import {
  createPublicClient,
  getAddress,
  http,
  isAddressEqual,
  zeroAddress,
  type Address,
} from "viem";
import { celo } from "viem/chains";
import type { HumanRootLookup, StakeLookup } from "./verify.js";

/** GoodDollar Identity (sybil resistance) on Celo mainnet. */
export const GOODDOLLAR_IDENTITY_CELO =
  "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42" as const;

/** AgentVault (required refundable G$ bond) on Celo mainnet. */
export const AGENT_VAULT_CELO =
  "0x0409042B55e99Df8c0Feb7525A770838f3A47090" as const;

const identityAbi = [
  {
    type: "function",
    name: "getWhitelistedRoot",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "whitelisted", type: "address" }],
  },
] as const;

export interface HumanRootLookupOptions {
  /** Celo RPC URL. Defaults to the public forno endpoint. */
  rpcUrl?: string;
  /** Override the GoodDollar Identity contract address. */
  identity?: Address;
}

/**
 * Build a {@link HumanRootLookup} backed by the live GoodDollar Identity contract
 * on Celo. Returns the operator's whitelisted root, or null if not verified.
 * Self-contained (viem only) so the SDK has no workspace dependencies.
 */
export function createHumanRootLookup(
  opts?: HumanRootLookupOptions,
): HumanRootLookup {
  const client = createPublicClient({
    chain: celo,
    transport: http(opts?.rpcUrl ?? "https://forno.celo.org"),
  });
  const identity = opts?.identity ?? (GOODDOLLAR_IDENTITY_CELO as Address);

  return async (operator: Address): Promise<Address | null> => {
    const root = await client.readContract({
      address: identity,
      abi: identityAbi,
      functionName: "getWhitelistedRoot",
      args: [getAddress(operator)],
    });
    if (!root || isAddressEqual(root as Address, zeroAddress)) return null;
    return root as Address;
  };
}

/** Default live lookup against GoodDollar Identity on Celo mainnet. */
export const liveHumanRootLookup: HumanRootLookup = createHumanRootLookup();

const agentVaultAbi = [
  {
    type: "function",
    name: "stakeOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface StakeLookupOptions {
  /** Celo RPC URL. Defaults to the public forno endpoint. */
  rpcUrl?: string;
  /** Override the AgentVault contract address. */
  vault?: Address;
}

/**
 * Build a {@link StakeLookup} backed by the live AgentVault on Celo. Reads the
 * agent's current G$ bond and the vault minimum, so verification fails with
 * `insufficient_bond` once an operator withdraws the bond.
 */
export function createStakeLookup(opts?: StakeLookupOptions): StakeLookup {
  const client = createPublicClient({
    chain: celo,
    transport: http(opts?.rpcUrl ?? "https://forno.celo.org"),
  });
  const vault = opts?.vault ?? (AGENT_VAULT_CELO as Address);

  return async (agent: Address) => {
    const [stake, minStake] = await Promise.all([
      client.readContract({
        address: vault,
        abi: agentVaultAbi,
        functionName: "stakeOf",
        args: [getAddress(agent)],
      }),
      client.readContract({
        address: vault,
        abi: agentVaultAbi,
        functionName: "minStake",
      }),
    ]);
    return { stake, minStake };
  };
}

/** Default live bond lookup against the AgentVault on Celo mainnet. */
export const liveStakeLookup: StakeLookup = createStakeLookup();
