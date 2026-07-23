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
  const host = useMemo(
    () => createHostClient(config.hostBaseUrl),
    [config.hostBaseUrl],
  );
  const api = useMemo(
    () => createApiClient(config.apiBaseUrl),
    [config.apiBaseUrl],
  );

  const value = useMemo<WidgetContextValue>(
    () => ({
      config,
      wallet,
      host,
      api,
      vaultAddress: config.vaultAddress,
      rpcUrl: config.rpcUrl,
    }),
    [config, wallet, host, api],
  );

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
