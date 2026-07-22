import {
  IdentitySDK,
  SupportedChains,
  type contractEnv,
} from "@goodsdks/citizen-sdk";
import {
  createPublicClient,
  http,
  type Hex,
  type PublicClient,
} from "viem";
import { celo } from "viem/chains";
import { GOODAGENT_SITE_ORIGIN } from "./public-urls.js";
import type { GoodAgentWalletAdapter, GoodAgentWidgetConfig } from "./types.js";

export function buildFvCallbackUrl(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof window === "undefined") return `${GOODAGENT_SITE_ORIGIN}/issue`;
  const url = new URL(window.location.href);
  url.searchParams.delete("isVerified");
  url.searchParams.delete("reason");
  return url.toString();
}

export function parseFvCallback(searchParams: URLSearchParams): {
  isVerified: boolean;
  reason: string | null;
} | null {
  const raw = searchParams.get("isVerified");
  if (raw === null) return null;
  return {
    isVerified: raw === "true" || raw === "1",
    reason: searchParams.get("reason"),
  };
}

export async function startGoodDollarFaceVerification(
  wallet: GoodAgentWalletAdapter,
  config: GoodAgentWidgetConfig,
  rpcUrl: string,
): Promise<void> {
  if (!wallet.address) throw new Error("Wallet not connected");

  const publicClient = createPublicClient({
    chain: celo,
    transport: http(rpcUrl),
  }) as PublicClient;

  const walletClient = {
    account: { address: wallet.address },
    signMessage: async ({ message }: { message: string | { raw: Hex } }) => {
      const text =
        typeof message === "string"
          ? message
          : typeof message === "object" && "raw" in message
            ? String(message.raw)
            : String(message);
      return wallet.signMessage(text);
    },
  };

  const env: contractEnv = config.goodDollarEnv ?? "production";
  const sdk = await IdentitySDK.init({
    publicClient,
    walletClient: walletClient as never,
    env,
  });

  const link = await sdk.generateFVLink(
    false,
    buildFvCallbackUrl(config.fvCallbackUrl),
    celo.id as SupportedChains,
  );

  if (typeof window !== "undefined") {
    window.location.assign(link);
  }
}
