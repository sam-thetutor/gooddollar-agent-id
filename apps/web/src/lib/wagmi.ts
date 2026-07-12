import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { celo } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { http } from "wagmi";
import {
  METAMASK_WALLET_ID,
  shouldUseWalletConnect,
  WALLETCONNECT_PROJECT_ID,
} from "./wallet-mobile.js";

const projectId = WALLETCONNECT_PROJECT_ID;
const rpcUrl = import.meta.env.VITE_CELO_RPC_URL as string | undefined;

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
  // Prefer metamask:// deep links over universal links that open the in-app browser.
  experimental_preferUniversalLinks: false,
  // WC reconnect on refresh opens "Approve in wallet" but cannot deep-link to
  // MetaMask without a user tap — disable on mobile browsers without injection.
  enableReconnect: !shouldUseWalletConnect(),
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
  },
});

export const CELO_ID = celo.id;
