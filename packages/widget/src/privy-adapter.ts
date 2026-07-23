import { useMemo } from "react";
import {
  usePrivy,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useWallets,
} from "@privy-io/react-auth";
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { celo } from "viem/chains";
import type { GoodAgentWalletAdapter } from "./types.js";

/** Minimal Privy wallet shape — matches `ConnectedWallet` from `@privy-io/react-auth`. */
export interface PrivyConnectedWalletLike {
  address: string;
  walletClientType?: string;
}

export interface PrivyWalletAdapterOptions {
  /** Prefer WalletConnect / MiniPay / injected over Privy embedded (Game Arena pattern). */
  preferExternal?: boolean;
  /** Pin a specific connected wallet address. */
  address?: Address;
  /** Chain id for contract writes (default: Celo mainnet). */
  chainId?: number;
  /** RPC URL for receipt polling (default: Celo forno). */
  rpcUrl?: string;
}

export function pickPrivyWallet(
  wallets: PrivyConnectedWalletLike[],
  opts?: Pick<PrivyWalletAdapterOptions, "preferExternal" | "address">,
): PrivyConnectedWalletLike | undefined {
  if (!wallets.length) return undefined;

  if (opts?.address) {
    const target = opts.address.toLowerCase();
    return wallets.find((w) => w.address.toLowerCase() === target);
  }

  const isEmbedded = (w: PrivyConnectedWalletLike) =>
    w.walletClientType === "privy" || w.walletClientType === "privy_v2";

  const embedded = wallets.find(isEmbedded);
  const external = wallets.find((w) => !isEmbedded(w));

  if (opts?.preferExternal) return external ?? embedded ?? wallets[0];
  return embedded ?? external ?? wallets[0];
}

/** Build a widget adapter from Privy session + signing helpers (headless / testable). */
export function createWalletAdapterFromPrivy(input: {
  ready: boolean;
  authenticated: boolean;
  login?: () => void | Promise<void>;
  wallet: PrivyConnectedWalletLike | undefined;
  /** Used when Privy wallet list is briefly empty after signing (wagmi drop). */
  fallbackAddress?: Address;
  signMessage: (message: string, walletAddress: Address) => Promise<Hex>;
  signTypedData: (
    params: {
      domain: Record<string, unknown>;
      types: Record<string, ReadonlyArray<{ readonly name: string; readonly type: string }>>;
      primaryType: string;
      message: Record<string, unknown>;
    },
    walletAddress: Address,
  ) => Promise<Hex>;
  sendTransaction: (
    tx: { to: Address; data?: Hex; chainId: number },
    walletAddress: Address,
  ) => Promise<Hex>;
  waitForTransactionReceipt?: (hash: Hex) => Promise<unknown>;
  chainId?: number;
}): GoodAgentWalletAdapter {
  const chainId = input.chainId ?? celo.id;
  const address = input.wallet?.address
    ? (getAddress(input.wallet.address) as Address)
    : input.fallbackAddress
      ? (getAddress(input.fallbackAddress) as Address)
      : undefined;

  return {
    address,
    isConnected: input.ready && input.authenticated && !!address,
    connect: input.login
      ? () => Promise.resolve(input.login!())
      : undefined,
    signMessage: async (message) => {
      if (!address) throw new Error("Wallet not connected");
      return input.signMessage(message, address);
    },
    signTypedData: async (params) => {
      if (!address) throw new Error("Wallet not connected");
      return input.signTypedData(params, address);
    },
    writeContract: async ({ address: contract, abi, functionName, args }) => {
      if (!address) throw new Error("Wallet not connected");
      const data = encodeFunctionData({
        abi: abi as readonly unknown[],
        functionName,
        args: args as readonly unknown[],
      });
      return input.sendTransaction(
        { to: contract, data, chainId },
        address,
      );
    },
    waitForTransactionReceipt: input.waitForTransactionReceipt,
  };
}

/**
 * One-liner Privy adapter for sites like Game Arena (Privy + embedded wallet + WC/MiniPay).
 *
 * @example
 * ```tsx
 * const wallet = usePrivyWalletAdapter({ preferExternal: true });
 * return <GoodAgentWidget wallet={wallet} config={...} />;
 * ```
 */
export function usePrivyWalletAdapter(
  opts: PrivyWalletAdapterOptions = {},
): GoodAgentWalletAdapter {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTypedData } = useSignTypedData();
  const { sendTransaction } = useSendTransaction();

  const chainId = opts.chainId ?? celo.id;
  const rpcUrl = opts.rpcUrl ?? "https://forno.celo.org";

  const wallet = useMemo(
    () => pickPrivyWallet(wallets, opts),
    [wallets, opts.preferExternal, opts.address],
  );

  const connectedWallet = useMemo(() => {
    if (!opts.address) return wallet;
    return (
      wallets.find(
        (w) => w.address.toLowerCase() === opts.address!.toLowerCase(),
      ) ?? wallet
    );
  }, [wallets, opts.address, wallet]);

  const effectiveWallet = useMemo((): PrivyConnectedWalletLike | undefined => {
    if (connectedWallet) return connectedWallet;
    if (opts.address && authenticated) {
      return { address: opts.address, walletClientType: "external" };
    }
    return undefined;
  }, [connectedWallet, opts.address, authenticated]);

  const publicClient = useMemo(
    () => createPublicClient({ chain: celo, transport: http(rpcUrl) }),
    [rpcUrl],
  );

  return useMemo(
    () =>
      createWalletAdapterFromPrivy({
        ready,
        authenticated,
        login,
        wallet: effectiveWallet,
        fallbackAddress: opts.address,
        signMessage: async (message, walletAddress) => {
          const { signature } = await signMessage({ message }, { address: walletAddress });
          return signature as Hex;
        },
        signTypedData: async (params, walletAddress) => {
          const typed = {
            domain: params.domain,
            types: params.types as Record<
              string,
              Array<{ name: string; type: string }>
            >,
            primaryType: params.primaryType,
            message: params.message,
          };
          const matched = wallets.find(
            (w) => w.address.toLowerCase() === walletAddress.toLowerCase(),
          );
          if (
            matched &&
            "signTypedData" in matched &&
            typeof matched.signTypedData === "function"
          ) {
            const { signature } = await matched.signTypedData(typed);
            return signature as Hex;
          }
          const { signature } = await signTypedData(typed, {
            address: walletAddress,
          });
          return signature as Hex;
        },
        sendTransaction: async (tx, walletAddress) => {
          const { hash } = await sendTransaction(
            {
              to: tx.to,
              data: tx.data,
              chainId: tx.chainId ?? chainId,
            },
            { address: walletAddress },
          );
          return hash as Hex;
        },
        waitForTransactionReceipt: (hash) =>
          publicClient.waitForTransactionReceipt({ hash }),
        chainId,
      }),
    [
      ready,
      authenticated,
      login,
      effectiveWallet,
      opts.address,
      wallets,
      signMessage,
      signTypedData,
      sendTransaction,
      chainId,
      publicClient,
    ],
  );
}
