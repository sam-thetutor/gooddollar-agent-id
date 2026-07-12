import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { celo } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { http } from "wagmi";

const projectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? "";
const rpcUrl = import.meta.env.VITE_CELO_RPC_URL as string | undefined;

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
  metadata: {
    name: "GoodAgent",
    description: "The passport-free Proof-of-Human layer for AI agents.",
    url: "https://goodagentids.xyz",
    icons: ["https://goodagentids.xyz/icon-256.png"],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
});

export const CELO_ID = celo.id;
