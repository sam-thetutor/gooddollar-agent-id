import {
  IdentitySDK,
  SupportedChains,
  type contractEnv,
} from "@goodsdks/citizen-sdk";
import type { PublicClient, WalletClient } from "viem";
import { CELO_ID } from "./wagmi.js";

export type GoodDollarEnv = contractEnv;

export function getGoodDollarEnv(): GoodDollarEnv {
  const env = import.meta.env.VITE_GOODDOLLAR_ENV;
  if (env === "staging" || env === "development") return env;
  return "production";
}

/** Callback URL for face verification — preserves current path and query. */
export function buildGoodDollarCallbackUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("isVerified");
  url.searchParams.delete("reason");
  return url.toString();
}

export interface FvCallbackResult {
  isVerified: boolean;
  reason: string | null;
}

export function parseFvCallback(
  searchParams: URLSearchParams,
): FvCallbackResult | null {
  const raw = searchParams.get("isVerified");
  if (raw === null) return null;
  return {
    isVerified: raw === "true" || raw === "1",
    reason: searchParams.get("reason"),
  };
}

export function fvCallbackSearchWithoutFv(
  searchParams: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete("isVerified");
  next.delete("reason");
  return next;
}

/**
 * Ask the connected wallet to sign, then redirect to GoodDollar face
 * verification. On completion the user returns to `callbackUrl` with
 * `isVerified` and optional `reason` query params.
 */
export async function startGoodDollarFaceVerification(
  publicClient: PublicClient,
  walletClient: WalletClient,
  callbackUrl = buildGoodDollarCallbackUrl(),
): Promise<void> {
  const sdk = await IdentitySDK.init({
    publicClient,
    walletClient,
    env: getGoodDollarEnv(),
  });

  const link = await sdk.generateFVLink(
    false,
    callbackUrl,
    CELO_ID as SupportedChains,
  );

  window.location.assign(link);
}
