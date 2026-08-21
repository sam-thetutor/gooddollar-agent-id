import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { celo } from "viem/chains";

const rpcUrl = import.meta.env.VITE_CELO_RPC_URL as string | undefined;

export const wagmiConfig = createConfig({
  chains: [celo],
  transports: {
    [celo.id]: http(rpcUrl),
  },
});

export const CELO_ID = celo.id;
