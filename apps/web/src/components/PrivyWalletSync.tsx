import {
  useActiveWallet,
  usePrivy,
  useWallets,
  type ConnectedWallet,
} from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import {
  pickDefaultWallet,
  sameAddress,
} from "../lib/privy-wallet.js";

/** Keeps Privy active wallet and wagmi `useAccount` in sync without a page refresh. */
export function PrivyWalletSync() {
  const { authenticated, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { wallet: privyActive, setActiveWallet: setPrivyActive } =
    useActiveWallet();
  const { setActiveWallet: setWagmiActive } = useSetActiveWallet();
  const { address } = useAccount();
  const syncing = useRef(false);

  const walletKey = wallets.map((w) => w.address.toLowerCase()).sort().join(",");

  useEffect(() => {
    if (!authenticated || !walletsReady || wallets.length === 0) return;
    if (syncing.current) return;

    const sync = async () => {
      syncing.current = true;
      try {
        let target: ConnectedWallet | undefined = privyActive as
          | ConnectedWallet
          | undefined;

        if (!target || !wallets.some((w) => sameAddress(w.address, target!.address))) {
          target = pickDefaultWallet(wallets, user);
          if (target) setPrivyActive(target);
        }

        if (!target) return;
        if (sameAddress(address, target.address)) return;

        await setWagmiActive(target);
      } finally {
        syncing.current = false;
      }
    };

    void sync();
  }, [
    authenticated,
    walletsReady,
    walletKey,
    privyActive,
    user,
    address,
    wallets,
    setPrivyActive,
    setWagmiActive,
  ]);

  return null;
}
