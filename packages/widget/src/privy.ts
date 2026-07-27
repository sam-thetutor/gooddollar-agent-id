/** Privy wallet helpers — import from `@goodagent/widget/privy` so wagmi-only apps skip this dependency. */
export {
  createWalletAdapterFromPrivy,
  pickPrivyWallet,
  usePrivyWalletAdapter,
} from "./privy-adapter.js";
export type {
  PrivyConnectedWalletLike,
  PrivyWalletAdapterOptions,
} from "./privy-adapter.js";
