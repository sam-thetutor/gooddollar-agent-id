import { CELO_CHAIN_ID } from "@g-copilot/shared";
import {
  createPublicClient,
  http,
  type HttpTransport,
  type PublicClient,
} from "viem";
import { celo } from "viem/chains";
import { getRpcUrl } from "./addresses.js";

/**
 * Shared Celo public client for read-only chain access.
 * Explicit return type keeps declaration emit stable for consumers.
 */
export function createCeloPublicClient(): PublicClient<
  HttpTransport,
  typeof celo
> {
  return createPublicClient({
    chain: celo,
    transport: http(getRpcUrl(), {
      timeout: 30_000,
    }),
  });
}

export function getChainId(): number {
  return CELO_CHAIN_ID;
}

/** Phase 0 stub — returns true if RPC responds */
export async function pingChain(): Promise<boolean> {
  try {
    const client = createCeloPublicClient();
    await client.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}
