import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { celo } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { http } from "wagmi";
import { METAMASK_WALLET_ID } from "./wallet-mobile.js";

const projectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? "";
const rpcUrl = import.meta.env.VITE_CELO_RPC_URL as string | undefined;

if (!projectId && import.meta.env.PROD) {
  console.error(
    "VITE_WALLETCONNECT_PROJECT_ID is required for mobile wallet connections",
  );
}

const siteOrigin =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://goodagentids.xyz";

const networks = [celo] as const;

// Reown AppKit (multi-wallet modal) on top of wagmi. MetaMask is the headline
// connector; WalletConnect QR + Coinbase etc. come for free.
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [...networks],
  transports: {
    [celo.id]: http(rpcUrl),
  },
});

export const config = wagmiAdapter.wagmiConfig;

createAppKit({
  adapters: [wagmiAdapter],
  networks: [celo],
  projectId,
  featuredWalletIds: [METAMASK_WALLET_ID],
  enableMobileFullScreen: true,
  metadata: {
    name: "GoodAgent",
    description: "The passport-free Proof-of-Human layer for AI agents.",
    url: siteOrigin,
    icons: ["https://goodagentids.xyz/icon-256.png"],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
    headless: true,
  },
});

export const CELO_ID = celo.id;
