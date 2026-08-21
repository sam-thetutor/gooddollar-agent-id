import { formatUnits } from "viem";
import type { Address, Hex } from "viem";
import type { LocalAccount } from "viem/accounts";
import {
  DEFAULT_USDT_TARGET,
  ensureUsdtBalance,
  quoteGsToUsdt,
  createSwapPublicClient,
  readUsdtBalance,
  type EnsureUsdtBalanceOptions,
  type EnsureUsdtBalanceResult,
} from "@goodagent/chain";
import type { RuntimeConfig } from "./config.js";

export interface FundAgentUsdtResult extends EnsureUsdtBalanceResult {
  agentAddress: Address;
}

/** Conservative G$ deploy target when chess arena needs USDT stake liquidity. */
export { CHESS_ARENA_MIN_FUNDING_GS } from "./skill-env.js";

export async function quoteAgentUsdtFunding(
  config: RuntimeConfig,
  agentAddress: Address,
  targetUsdt = DEFAULT_USDT_TARGET,
): Promise<{
  currentUsdt: bigint;
  targetUsdt: bigint;
  quote: Awaited<ReturnType<typeof quoteGsToUsdt>>;
}> {
  const pub = createSwapPublicClient(config.rpcUrl);
  const currentUsdt = await readUsdtBalance(pub, agentAddress);
  const shortfall =
    targetUsdt > currentUsdt ? targetUsdt - currentUsdt : 0n;
  const quote = await quoteGsToUsdt(pub, shortfall);
  return { currentUsdt, targetUsdt, quote };
}

/**
 * Ensure the agent play wallet holds enough USDT for chess arena stakes by
 * swapping G$ → USDm → USDT on Celo.
 */
export async function fundAgentUsdtFromGs(
  config: RuntimeConfig,
  account: LocalAccount,
  opts: EnsureUsdtBalanceOptions = {},
): Promise<FundAgentUsdtResult> {
  const result = await ensureUsdtBalance(account, {
    rpcUrl: config.rpcUrl,
    ...opts,
  });

  if (result.swapped) {
    console.log(
      `[fund-usdt] ${account.address} now has ${formatUnits(result.usdtBalance, 6)} USDT ` +
        `(spent ~${formatUnits(result.gsSpent ?? 0n, 18)} G$, received ${formatUnits(result.usdtReceived ?? 0n, 6)} USDT)`,
    );
    for (const hash of result.txHashes ?? []) {
      console.log(`[fund-usdt] tx: ${hash}`);
    }
  } else {
    console.log(
      `[fund-usdt] ${account.address} already has ${formatUnits(result.usdtBalance, 6)} USDT — skip swap`,
    );
  }

  return { agentAddress: account.address, ...result };
}

export async function fundAgentUsdtFromGsByKey(
  config: RuntimeConfig,
  agentAddress: Address,
  agentPrivateKey: Hex,
  opts: EnsureUsdtBalanceOptions = {},
): Promise<FundAgentUsdtResult> {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(agentPrivateKey);
  if (account.address.toLowerCase() !== agentAddress.toLowerCase()) {
    throw new Error("Agent private key does not match agent address");
  }
  return fundAgentUsdtFromGs(config, account, opts);
}
