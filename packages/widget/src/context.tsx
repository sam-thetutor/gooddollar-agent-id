import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { createApiClient, type ApiClient } from "./client/api.js";
import { createHostClient, type HostClient } from "./client/host.js";
import type { GoodAgentWalletAdapter, GoodAgentWidgetConfig } from "./types.js";

export interface WidgetContextValue {
  config: GoodAgentWidgetConfig;
  wallet: GoodAgentWalletAdapter;
  host: HostClient;
  api: ApiClient;
  vaultAddress: `0x${string}`;
  rpcUrl: string;
}

const WidgetContext = createContext<WidgetContextValue | null>(null);

export function WidgetProvider({
  config,
  wallet,
  children,
}: {
  config: GoodAgentWidgetConfig;
  wallet: GoodAgentWalletAdapter;
  children: ReactNode;
}) {
  const value = useMemo<WidgetContextValue>(() => {
    const vaultAddress =
      config.vaultAddress ??
      ("0x0409042B55e99Df8c0Feb7525A770838f3A47090" as `0x${string}`);
    return {
      config,
      wallet,
      host: createHostClient(config.hostBaseUrl),
      api: createApiClient(config.apiBaseUrl),
      vaultAddress,
      rpcUrl: config.rpcUrl ?? "https://forno.celo.org",
    };
  }, [config, wallet]);

  return (
    <WidgetContext.Provider value={value}>{children}</WidgetContext.Provider>
  );
}

export function useWidget(): WidgetContextValue {
  const ctx = useContext(WidgetContext);
  if (!ctx) {
    throw new Error("useWidget must be used within WidgetProvider");
  }
  return ctx;
}
