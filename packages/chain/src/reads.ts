import {
  CELO_CHAIN_ID,
  ErrorCodes,
  G_DOLLAR_DECIMALS,
  GCopilotError,
} from "@g-copilot/shared";
import { formatUnits, getAddress, type Address } from "viem";
import {
  erc20Abi,
  identityAbi,
  ubiSchemeAbi,
} from "./abis.js";
import {
  G_DOLLAR_ADDRESS,
  IDENTITY_ADDRESS,
  UBI_SCHEME_ADDRESS,
} from "./addresses.js";
import { createCeloPublicClient } from "./client.js";

const SECONDS_PER_DAY = 86_400n;

function normalizeAddress(value: string): Address {
  try {
    return getAddress(value);
  } catch {
    throw new GCopilotError(
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
    throw new GCopilotError(
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
    throw new GCopilotError(
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
    throw new GCopilotError(
      `Failed to read claim eligibility: ${(error as Error).message}`,
      ErrorCodes.RPC_ERROR,
    );
  }
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
    throw new GCopilotError(
      `Failed to read daily stats: ${(error as Error).message}`,
      ErrorCodes.RPC_ERROR,
    );
  }
}
