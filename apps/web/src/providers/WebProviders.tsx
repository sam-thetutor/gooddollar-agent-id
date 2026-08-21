import { PrivyProvider } from "@privy-io/react-auth";
import type { ConnectedWallet, User } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { PrivyWalletSync } from "../components/PrivyWalletSync.js";
import { pickDefaultWallet } from "../lib/privy-wallet.js";
import { getPrivyConfig, PRIVY_APP_ID } from "../lib/privy-config.js";
import { wagmiConfig } from "../lib/wagmi.js";

function pickActiveWalletForWagmi({
  wallets,
  user,
}: {
  wallets: ConnectedWallet[];
  user: User | null;
}): ConnectedWallet | undefined {
  return pickDefaultWallet(wallets, user);
}

export function WebProviders({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);

  if (!PRIVY_APP_ID) {
    return (
      <div className="privy-missing-banner">
        Set <code>VITE_PRIVY_APP_ID</code> in the repo root <code>.env</code>{" "}
        (from{" "}
        <a href="https://dashboard.privy.io" rel="noreferrer" target="_blank">
          Privy dashboard
        </a>
        ).
      </div>
    );
  }

  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={getPrivyConfig()}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider
          config={wagmiConfig}
          setActiveWalletForWagmi={pickActiveWalletForWagmi}
        >
          <PrivyWalletSync />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
