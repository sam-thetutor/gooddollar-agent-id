import type { Address, Hex } from "viem";
import type { GoodAgentWalletAdapter } from "./types.js";

/** Bridge a wagmi-style wallet hook into the widget adapter. */
export function createWalletAdapterFromHooks(hooks: {
  address: Address | undefined;
  isConnected: boolean;
  connect?: () => Promise<void>;
  signMessageAsync: (args: { message: string }) => Promise<Hex>;
  signTypedDataAsync: (args: {
    domain: Record<string, unknown>;
    types: Record<string, ReadonlyArray<{ readonly name: string; readonly type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
  writeContractAsync: (args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<Hex>;
  waitForTransactionReceipt?: (args: { hash: Hex }) => Promise<unknown>;
}): GoodAgentWalletAdapter {
  return {
    address: hooks.address,
    isConnected: hooks.isConnected,
    connect: hooks.connect,
    signMessage: (message) => hooks.signMessageAsync({ message }),
    signTypedData: (params) => hooks.signTypedDataAsync(params),
    writeContract: (params) => hooks.writeContractAsync(params),
    waitForTransactionReceipt: hooks.waitForTransactionReceipt
      ? (hash) => hooks.waitForTransactionReceipt!({ hash })
      : undefined,
  };
}
