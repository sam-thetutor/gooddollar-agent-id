import type { PrivyClientConfig } from "@privy-io/react-auth";
import { celo } from "viem/chains";
import {
  isMobileBrowser,
  WALLETCONNECT_PROJECT_ID,
} from "./wallet-mobile.js";

export const PRIVY_APP_ID =
  (import.meta.env.VITE_PRIVY_APP_ID as string | undefined)?.trim() ?? "";

/** Privy login + wallet modal config (Google/email + MetaMask on mobile). */
export function getPrivyConfig(): PrivyClientConfig {
  const mobile =
    typeof navigator !== "undefined" && isMobileBrowser();

  return {
    loginMethods: ["google", "email", "wallet"],
    appearance: {
      theme: "light",
      accentColor: "#2563eb",
      logo: "https://goodagentids.xyz/icon-256.png",
      showWalletLoginFirst: false,
      walletList: mobile
        ? ["metamask", "coinbase_wallet", "wallet_connect"]
        : ["metamask", "coinbase_wallet", "wallet_connect_qr"],
    },
    embeddedWallets: {
      ethereum: {
        createOnLogin: "users-without-wallets",
      },
    },
    defaultChain: celo,
    supportedChains: [celo],
    walletConnectCloudProjectId: WALLETCONNECT_PROJECT_ID,
  };
}
