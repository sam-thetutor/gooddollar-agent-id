import {
  CELO_CHAIN_ID,
  ErrorCodes,
  G_DOLLAR_DECIMALS,
  AgentIdError,
} from "@goodagent/shared";
import { formatUnits, getAddress, hexToString, type Address } from "viem";
import {
  agentVaultAbi,
  erc20Abi,
  erc8004IdentityAbi,
  identityAbi,
  ubiSchemeAbi,
} from "./abis.js";
import {
  AGENT_ATTESTATION_ADDRESS,
  AGENT_REVOCATION_ADDRESS,
  ERC8004_IDENTITY_REGISTRY,
  G_DOLLAR_ADDRESS,
  GOODDOLLAR_PROOF_METADATA_KEY,
  IDENTITY_ADDRESS,
  UBI_SCHEME_ADDRESS,
  getAgentVaultAddress,
} from "./addresses.js";
import { createCeloPublicClient } from "./client.js";

const SECONDS_PER_DAY = 86_400n;

function normalizeAddress(value: string): Address {
  try {
    return getAddress(value);
  } catch {
    throw new AgentIdError(
      `Invalid address: ${value}`,
      ErrorCodes.INVALID_ADDRESS,
    );
  }
}

export interface BalanceResult {
  balance: string;
  balanceFormatted: string;
  symbol: string;
}

export async function getGBalance(wallet: string): Promise<BalanceResult> {
  const account = normalizeAddress(wallet);
  const client = createCeloPublicClient();
  const token = G_DOLLAR_ADDRESS[CELO_CHAIN_ID];

  try {
    const balance = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });

    return {
      balance: balance.toString(),
      balanceFormatted: formatUnits(balance, G_DOLLAR_DECIMALS),
      symbol: "G$",
    };
  } catch (error) {
    throw new AgentIdError(
      `Failed to read balance: ${(error as Error).message}`,
      ErrorCodes.RPC_ERROR,
    );
  }
}

export interface VerifyStatusResult {
  wallet: string;
  isWhitelisted: boolean;
  root: string | null;
  expiresAt: string | null;
}

export async function getVerifyStatus(
  wallet: string,
): Promise<VerifyStatusResult> {
  const account = normalizeAddress(wallet);
  const client = createCeloPublicClient();
  const identity = IDENTITY_ADDRESS[CELO_CHAIN_ID];

  try {
    const [isWhitelisted, root, lastAuth, authPeriodDays] = await Promise.all([
      client.readContract({
        address: identity,
        abi: identityAbi,
        functionName: "isWhitelisted",
        args: [account],
      }),
      client.readContract({
        address: identity,
        abi: identityAbi,
        functionName: "getWhitelistedRoot",
        args: [account],
      }),
      client.readContract({
        address: identity,
        abi: identityAbi,
        functionName: "lastAuthenticated",
        args: [account],
      }),
      client.readContract({
        address: identity,
        abi: identityAbi,
        functionName: "authenticationPeriod",
        args: [],
      }),
    ]);

    let expiresAt: string | null = null;
    if (lastAuth > 0n) {
      const expirySeconds = lastAuth + authPeriodDays * SECONDS_PER_DAY;
      expiresAt = new Date(Number(expirySeconds) * 1000).toISOString();
    }

    const rootAddress = root as Address;
    const isZeroRoot = /^0x0+$/.test(rootAddress);

    return {
      wallet: account,
      isWhitelisted,
      root: isZeroRoot ? null : rootAddress,
      expiresAt,
    };
  } catch (error) {
    throw new AgentIdError(
      `Failed to read identity status: ${(error as Error).message}`,
      ErrorCodes.RPC_ERROR,
    );
  }
}

export interface ClaimEligibilityResult {
  wallet: string;
  /** True only when the wallet is verified AND has an unclaimed entitlement today. */
  eligible: boolean;
  isWhitelisted: boolean;
  /** Whether there is an unclaimed entitlement today (independent of verification). */
  hasEntitlement: boolean;
  claimAmount: string;
  claimAmountFormatted: string;
}

export async function getClaimEligibility(
  wallet: string,
): Promise<ClaimEligibilityResult> {
  const account = normalizeAddress(wallet);
  const client = createCeloPublicClient();
  const ubi = UBI_SCHEME_ADDRESS[CELO_CHAIN_ID];
  const identity = IDENTITY_ADDRESS[CELO_CHAIN_ID];

  try {
    // checkEntitlement returns the day's amount for any address that hasn't
    // claimed yet, regardless of verification — so we also check whitelist.
    const [amount, isWhitelisted] = await Promise.all([
      client.readContract({
        address: ubi,
        abi: ubiSchemeAbi,
        functionName: "checkEntitlement",
        args: [account],
      }),
      client.readContract({
        address: identity,
        abi: identityAbi,
        functionName: "isWhitelisted",
        args: [account],
      }),
    ]);

    const hasEntitlement = amount > 0n;

    return {
      wallet: account,
      eligible: isWhitelisted && hasEntitlement,
      isWhitelisted,
      hasEntitlement,
      claimAmount: amount.toString(),
      claimAmountFormatted: formatUnits(amount, G_DOLLAR_DECIMALS),
    };
  } catch (error) {
    throw new AgentIdError(
      `Failed to read claim eligibility: ${(error as Error).message}`,
      ErrorCodes.RPC_ERROR,
    );
  }
}

/**
 * Batch-read claim eligibility for many wallets in one multicall (two reads per
 * wallet: UBIScheme.checkEntitlement + Identity.isWhitelisted). Used by the
 * Telegram reminder bot to scan all subscribers cheaply. Failed reads for a
 * wallet degrade to "not eligible" rather than failing the whole batch.
 */
export async function getClaimEligibilityBatch(
  wallets: string[],
): Promise<ClaimEligibilityResult[]> {
  if (wallets.length === 0) return [];
  const accounts = wallets.map(normalizeAddress);
  const client = createCeloPublicClient();
  const ubi = UBI_SCHEME_ADDRESS[CELO_CHAIN_ID];
  const identity = IDENTITY_ADDRESS[CELO_CHAIN_ID];

  const results = await client.multicall({
    contracts: accounts.flatMap((account) => [
      {
        address: ubi,
        abi: ubiSchemeAbi,
        functionName: "checkEntitlement" as const,
        args: [account] as const,
      },
      {
        address: identity,
        abi: identityAbi,
        functionName: "isWhitelisted" as const,
        args: [account] as const,
      },
    ]),
    allowFailure: true,
  });

  return accounts.map((account, i) => {
    const entitlement = results[i * 2];
    const whitelist = results[i * 2 + 1];
    const amount =
      entitlement.status === "success" ? (entitlement.result as bigint) : 0n;
    const isWhitelisted =
      whitelist.status === "success" && (whitelist.result as boolean);
    const hasEntitlement = amount > 0n;
    return {
      wallet: account,
      eligible: isWhitelisted && hasEntitlement,
      isWhitelisted,
      hasEntitlement,
      claimAmount: amount.toString(),
      claimAmountFormatted: formatUnits(amount, G_DOLLAR_DECIMALS),
    };
  });
}

export interface AgentVaultStatusResult {
  agent: string;
  /** True once the vault is deployed and configured (AGENT_VAULT_ADDRESS set). */
  vaultConfigured: boolean;
  /** Operator that controls this agent's bond, or null if never staked. */
  operator: string | null;
  /** G$ currently bonded behind the agent (required refundable accountability stake). */
  stake: string;
  stakeFormatted: string;
  /** Protocol minimum bond required to register an agent (base units). */
  minStake: string;
  minStakeFormatted: string;
  /** Whether the live bond meets the protocol minimum. */
  meetsMinStake: boolean;
  /** ISO timestamp after which a requested unstake can be withdrawn, or null. */
  unstakeUnlockAt: string | null;
}

/**
 * Reads the required refundable G$ bond backing an agent from the AgentVault.
 * Returns a `vaultConfigured: false` snapshot (all zeros) when the vault has
 * not been deployed/configured yet, so callers can render gracefully.
 */
export async function getAgentVaultStatus(
  agent: string,
): Promise<AgentVaultStatusResult> {
  const account = normalizeAddress(agent);
  const vault = getAgentVaultAddress();

  const empty: AgentVaultStatusResult = {
    agent: account,
    vaultConfigured: false,
    operator: null,
    stake: "0",
    stakeFormatted: "0",
    minStake: "0",
    minStakeFormatted: "0",
    meetsMinStake: false,
    unstakeUnlockAt: null,
  };

  if (!vault) return empty;

  const client = createCeloPublicClient();

  try {
    const [[operator, stake, unlockAt], minStake] = await Promise.all([
      client.readContract({
        address: vault,
        abi: agentVaultAbi,
        functionName: "getAgent",
        args: [account],
      }),
      client.readContract({
        address: vault,
        abi: agentVaultAbi,
        functionName: "minStake",
      }),
    ]);

    const zeroOperator = /^0x0+$/.test(operator);

    return {
      agent: account,
      vaultConfigured: true,
      operator: zeroOperator ? null : operator,
      stake: stake.toString(),
      stakeFormatted: formatUnits(stake, G_DOLLAR_DECIMALS),
      minStake: minStake.toString(),
      minStakeFormatted: formatUnits(minStake, G_DOLLAR_DECIMALS),
      meetsMinStake: stake >= minStake,
      unstakeUnlockAt:
        unlockAt > 0n
          ? new Date(Number(unlockAt) * 1000).toISOString()
          : null,
    };
  } catch (error) {
    throw new AgentIdError(
      `Failed to read agent vault status: ${(error as Error).message}`,
      ErrorCodes.RPC_ERROR,
    );
  }
}

/**
 * Batch-read the live G$ bond behind each agent (one multicall). Returns a
 * lowercase-address → stake map plus the sum, for explorer stats.
 */
export async function getAgentStakes(
  agents: string[],
): Promise<{ stakes: Record<string, string>; totalStaked: string }> {
  const vault = getAgentVaultAddress();
  if (!vault || agents.length === 0) {
    return { stakes: {}, totalStaked: "0" };
  }
  const client = createCeloPublicClient();
  const results = await client.multicall({
    contracts: agents.map((a) => ({
      address: vault,
      abi: agentVaultAbi,
      functionName: "stakeOf" as const,
      args: [normalizeAddress(a)] as const,
    })),
    allowFailure: true,
  });
  const stakes: Record<string, string> = {};
  let total = 0n;
  results.forEach((r, i) => {
    const stake = r.status === "success" ? (r.result as bigint) : 0n;
    stakes[agents[i].toLowerCase()] = stake.toString();
    total += stake;
  });
  return { stakes, totalStaked: total.toString() };
}

const attestationProvenAtAbi = [
  {
    type: "function",
    name: "provenAt",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Batch-read live key attestations (one multicall). Returns a lowercase
 * address → proven map, so the explorer reflects agents that attested after
 * they were registered.
 */
export async function getAgentAttestations(
  agents: string[],
): Promise<Record<string, boolean>> {
  if (agents.length === 0) return {};
  const client = createCeloPublicClient();
  const registry = AGENT_ATTESTATION_ADDRESS[CELO_CHAIN_ID];
  const results = await client.multicall({
    contracts: agents.map((a) => ({
      address: registry,
      abi: attestationProvenAtAbi,
      functionName: "provenAt" as const,
      args: [normalizeAddress(a)] as const,
    })),
    allowFailure: true,
  });
  const proven: Record<string, boolean> = {};
  results.forEach((r, i) => {
    proven[agents[i].toLowerCase()] =
      r.status === "success" && (r.result as bigint) !== 0n;
  });
  return proven;
}

const agentRevocationAbi = [
  {
    type: "function",
    name: "isRevoked",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Batch-read live on-chain revocations (one multicall). Returns a lowercase
 * address → revoked map so list endpoints match the Manage page kill switch.
 */
export async function getAgentRevocations(
  agents: string[],
): Promise<Record<string, boolean>> {
  if (agents.length === 0) return {};
  const client = createCeloPublicClient();
  const registry = AGENT_REVOCATION_ADDRESS[CELO_CHAIN_ID];
  const results = await client.multicall({
    contracts: agents.map((a) => ({
      address: registry,
      abi: agentRevocationAbi,
      functionName: "isRevoked" as const,
      args: [normalizeAddress(a)] as const,
    })),
    allowFailure: true,
  });
  const revoked: Record<string, boolean> = {};
  results.forEach((r, i) => {
    revoked[agents[i].toLowerCase()] =
      r.status === "success" && (r.result as boolean) === true;
  });
  return revoked;
}

export interface Erc8004AgentResult {
  agentId: string;
  /** ERC-721 owner of the agent NFT (the operator/custodian). */
  owner: string;
  /** Resolved registration-file URI (`tokenURI`). */
  agentURI: string;
  /** The agent's payment wallet (reserved `agentWallet` metadata), if set. */
  agentWallet: string | null;
  /**
   * Decoded GoodDollar proof stored on-chain under the reserved metadata key,
   * or null if the agent never attached one. This is the JSON value we wrote via
   * `setMetadata` (typically `{ type, credential }`).
   */
  gooddollarProof: unknown | null;
  registered: boolean;
}

/**
 * Read an ERC-8004 agent from the Identity Registry on Celo: owner, registration
 * URI, payment wallet, and any on-chain GoodDollar proof. Returns
 * `registered:false` if the agentId doesn't exist.
 */
export async function getErc8004Agent(
  agentId: bigint | number | string,
): Promise<Erc8004AgentResult> {
  const id = BigInt(agentId);
  const client = createCeloPublicClient();
  const registry = ERC8004_IDENTITY_REGISTRY[CELO_CHAIN_ID];

  let owner: Address;
  try {
    owner = await client.readContract({
      address: registry,
      abi: erc8004IdentityAbi,
      functionName: "ownerOf",
      args: [id],
    });
  } catch {
    // Non-existent token reverts ownerOf.
    return {
      agentId: id.toString(),
      owner: "0x0000000000000000000000000000000000000000",
      agentURI: "",
      agentWallet: null,
      gooddollarProof: null,
      registered: false,
    };
  }

  const [agentURI, walletRes, metaRes] = await Promise.all([
    client
      .readContract({
        address: registry,
        abi: erc8004IdentityAbi,
        functionName: "tokenURI",
        args: [id],
      })
      .catch(() => ""),
    client
      .readContract({
        address: registry,
        abi: erc8004IdentityAbi,
        functionName: "getAgentWallet",
        args: [id],
      })
      .catch(() => null),
    client
      .readContract({
        address: registry,
        abi: erc8004IdentityAbi,
        functionName: "getMetadata",
        args: [id, GOODDOLLAR_PROOF_METADATA_KEY],
      })
      .catch(() => "0x" as `0x${string}`),
  ]);

  let gooddollarProof: unknown | null = null;
  if (metaRes && metaRes !== "0x") {
    try {
      gooddollarProof = JSON.parse(hexToString(metaRes as `0x${string}`));
    } catch {
      gooddollarProof = null;
    }
  }

  return {
    agentId: id.toString(),
    owner,
    agentURI,
    agentWallet: walletRes ? (walletRes as Address) : null,
    gooddollarProof,
    registered: true,
  };
}

export interface DailyStatsResult {
  currentDay: string;
}

export async function getDailyStats(): Promise<DailyStatsResult> {
  const client = createCeloPublicClient();
  const ubi = UBI_SCHEME_ADDRESS[CELO_CHAIN_ID];

  try {
    const currentDay = await client.readContract({
      address: ubi,
      abi: ubiSchemeAbi,
      functionName: "currentDay",
      args: [],
    });

    return { currentDay: currentDay.toString() };
  } catch (error) {
    throw new AgentIdError(
      `Failed to read daily stats: ${(error as Error).message}`,
      ErrorCodes.RPC_ERROR,
    );
  }
}
