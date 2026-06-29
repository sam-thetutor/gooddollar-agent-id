import { createConfig, http } from "wagmi";
import { celo } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as
  | string
  | undefined;

const rpcUrl = import.meta.env.VITE_CELO_RPC_URL as string | undefined;

// When an injected wallet is present (MiniPay's in-app browser, or a desktop
// extension) we connect via `injected` only. Initializing WalletConnect /
// Web3Modal inside MiniPay's webview can blank the app, and it isn't needed
// there. WalletConnect is reserved for desktop browsers with no wallet (QR).
const hasInjectedProvider =
  typeof window !== "undefined" &&
  Boolean((window as { ethereum?: unknown }).ethereum);

export const config = createConfig({
  chains: [celo],
  connectors: [
    // Injected covers MiniPay (auto-connect) and browser extensions.
    injected({ shimDisconnect: true }),
    // QR-based WalletConnect only for desktop browsers without an injected wallet.
    ...(projectId && !hasInjectedProvider
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: {
              name: "G$ Copilot",
              description: "GoodDollar assistant on Celo",
              url: "https://gooddollar.org",
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [celo.id]: http(rpcUrl),
  },
});

export const CELO_ID = celo.id;
