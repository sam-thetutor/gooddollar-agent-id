import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  maxUint256,
  type Address,
  type Hex,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
} from "viem";
import { celo } from "viem/chains";
import type { LocalAccount } from "viem/accounts";
import { getRpcUrl } from "./addresses.js";
import { G_DOLLAR_CELO, USDM_CELO, USDT_CELO } from "./swap-addresses.js";
import {
  G_DOLLAR_USDM_EXCHANGE_ID,
  MENTO_BROKER_CELO,
  MENTO_EXCHANGE_PROVIDER_CELO,
  UNISWAP_QUOTER_CELO,
  UNISWAP_ROUTER_CELO,
  UNISWAP_USDM_USDT_FEE,
} from "./swap-addresses.js";
import {
  erc20SwapAbi,
  mentoBrokerAbi,
  uniswapQuoterAbi,
  uniswapSwapRouterAbi,
} from "./swap-abis.js";

const BPS = 10_000n;

/** Default USDT buffer for chess arena: 1 USDT (6 decimals). */
export const DEFAULT_USDT_TARGET = 1_000_000n;

/** Keep at least 50 G$ on the agent wallet after swapping. */
export const DEFAULT_MIN_GS_RESERVE = 50n * 10n ** 18n;

/** Slippage applied to quotes (2%). */
export const DEFAULT_SLIPPAGE_BPS = 200n;

export interface GsToUsdtQuote {
  usdtShortfall: bigint;
  usdmNeeded: bigint;
  gsRequired: bigint;
  gsRequiredWithSlippage: bigint;
  estimatedUsdtOut: bigint;
}

export interface EnsureUsdtBalanceResult {
  swapped: boolean;
  usdtBalance: bigint;
  quote?: GsToUsdtQuote;
  gsSpent?: bigint;
  usdmReceived?: bigint;
  usdtReceived?: bigint;
  txHashes?: Hex[];
}

export interface EnsureUsdtBalanceOptions {
  targetUsdt?: bigint;
  minGsReserve?: bigint;
  slippageBps?: bigint;
  rpcUrl?: string;
}

function applySlippageUp(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (BPS + slippageBps) + BPS - 1n) / BPS;
}

function applySlippageDown(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (BPS - slippageBps)) / BPS;
}

/** Convert a USDT amount (6 decimals) to an approximate USDm amount (18 decimals). */
export function usdmForUsdtTarget(usdtAmount: bigint): bigint {
  return usdtAmount * 10n ** 12n;
}

export function createSwapPublicClient(
  rpcUrl?: string,
): PublicClient<HttpTransport, typeof celo> {
  return createPublicClient({
    chain: celo,
    transport: http(rpcUrl ?? getRpcUrl()),
  });
}

export async function readUsdtBalance(
  pub: PublicClient<HttpTransport, typeof celo>,
  account: Address,
): Promise<bigint> {
  return pub.readContract({
    address: USDT_CELO,
    abi: erc20SwapAbi,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function readGsBalance(
  pub: PublicClient<HttpTransport, typeof celo>,
  account: Address,
): Promise<bigint> {
  return pub.readContract({
    address: G_DOLLAR_CELO,
    abi: erc20SwapAbi,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function quoteGsToUsdt(
  pub: PublicClient<HttpTransport, typeof celo>,
  usdtShortfall: bigint,
  slippageBps = DEFAULT_SLIPPAGE_BPS,
): Promise<GsToUsdtQuote> {
  if (usdtShortfall <= 0n) {
    return {
      usdtShortfall: 0n,
      usdmNeeded: 0n,
      gsRequired: 0n,
      gsRequiredWithSlippage: 0n,
      estimatedUsdtOut: 0n,
    };
  }

  const usdmNeeded = applySlippageUp(usdmForUsdtTarget(usdtShortfall), slippageBps);

  const gsRequired = await pub.readContract({
    address: MENTO_BROKER_CELO,
    abi: mentoBrokerAbi,
    functionName: "getAmountIn",
    args: [
      MENTO_EXCHANGE_PROVIDER_CELO,
      G_DOLLAR_USDM_EXCHANGE_ID,
      G_DOLLAR_CELO,
      USDM_CELO,
      usdmNeeded,
    ],
  });

  const gsRequiredWithSlippage = applySlippageUp(gsRequired, slippageBps);

  const [estimatedUsdtOut] = await pub.readContract({
    address: UNISWAP_QUOTER_CELO,
    abi: uniswapQuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: USDM_CELO,
        tokenOut: USDT_CELO,
        amountIn: usdmNeeded,
        fee: UNISWAP_USDM_USDT_FEE,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  return {
    usdtShortfall,
    usdmNeeded,
    gsRequired,
    gsRequiredWithSlippage,
    estimatedUsdtOut,
  };
}

async function ensureAllowance(
  wallet: WalletClient<HttpTransport, typeof celo, LocalAccount>,
  pub: PublicClient<HttpTransport, typeof celo>,
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint,
): Promise<Hex | null> {
  const allowance = await pub.readContract({
    address: token,
    abi: erc20SwapAbi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return null;

  const hash = await wallet.writeContract({
    address: token,
    abi: erc20SwapAbi,
    functionName: "approve",
    args: [spender, maxUint256],
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Swap G$ → USDm (MentoBroker) → USDT (Uniswap V3) until the wallet holds at least
 * `targetUsdt` atomic units (6 decimals).
 */
export async function ensureUsdtBalance(
  account: LocalAccount,
  opts: EnsureUsdtBalanceOptions = {},
): Promise<EnsureUsdtBalanceResult> {
  const rpcUrl = opts.rpcUrl;
  const targetUsdt = opts.targetUsdt ?? DEFAULT_USDT_TARGET;
  const minGsReserve = opts.minGsReserve ?? DEFAULT_MIN_GS_RESERVE;
  const slippageBps = opts.slippageBps ?? DEFAULT_SLIPPAGE_BPS;

  const pub = createSwapPublicClient(rpcUrl);
  const wallet = createWalletClient({
    account,
    chain: celo,
    transport: http(rpcUrl ?? "https://forno.celo.org"),
  });

  const owner = account.address;
  let usdtBalance = await readUsdtBalance(pub, owner);
  if (usdtBalance >= targetUsdt) {
    return { swapped: false, usdtBalance };
  }

  const usdtShortfall = targetUsdt - usdtBalance;
  const quote = await quoteGsToUsdt(pub, usdtShortfall, slippageBps);

  const gsBalance = await readGsBalance(pub, owner);
  const gsSpendable = gsBalance > minGsReserve ? gsBalance - minGsReserve : 0n;
  if (gsSpendable < quote.gsRequiredWithSlippage) {
    throw new Error(
      `Insufficient G$ for USDT swap: need ~${formatUnits(quote.gsRequiredWithSlippage, 18)} G$ ` +
        `(have ${formatUnits(gsSpendable, 18)} spendable after ${formatUnits(minGsReserve, 18)} G$ reserve) ` +
        `to reach ${formatUnits(targetUsdt, 6)} USDT`,
    );
  }

  const txHashes: Hex[] = [];

  const gsApprove = await ensureAllowance(
    wallet,
    pub,
    G_DOLLAR_CELO,
    owner,
    MENTO_BROKER_CELO,
    quote.gsRequiredWithSlippage,
  );
  if (gsApprove) txHashes.push(gsApprove);

  const usdmBefore = await pub.readContract({
    address: USDM_CELO,
    abi: erc20SwapAbi,
    functionName: "balanceOf",
    args: [owner],
  });

  const mentoHash = await wallet.writeContract({
    address: MENTO_BROKER_CELO,
    abi: mentoBrokerAbi,
    functionName: "swapOut",
    args: [
      MENTO_EXCHANGE_PROVIDER_CELO,
      G_DOLLAR_USDM_EXCHANGE_ID,
      G_DOLLAR_CELO,
      USDM_CELO,
      quote.usdmNeeded,
      quote.gsRequiredWithSlippage,
    ],
  });
  await pub.waitForTransactionReceipt({ hash: mentoHash });
  txHashes.push(mentoHash);

  const usdmAfter = await pub.readContract({
    address: USDM_CELO,
    abi: erc20SwapAbi,
    functionName: "balanceOf",
    args: [owner],
  });
  const usdmReceived = usdmAfter - usdmBefore;
  if (usdmReceived <= 0n) {
    throw new Error("MentoBroker swapOut produced no USDm");
  }

  const usdtBefore = usdtBalance;
  const minUsdtOut = applySlippageDown(usdtShortfall, slippageBps);

  const usdmApprove = await ensureAllowance(
    wallet,
    pub,
    USDM_CELO,
    owner,
    UNISWAP_ROUTER_CELO,
    usdmReceived,
  );
  if (usdmApprove) txHashes.push(usdmApprove);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const swapHash = await wallet.writeContract({
    address: UNISWAP_ROUTER_CELO,
    abi: uniswapSwapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: USDM_CELO,
        tokenOut: USDT_CELO,
        fee: UNISWAP_USDM_USDT_FEE,
        recipient: owner,
        deadline,
        amountIn: usdmReceived,
        amountOutMinimum: minUsdtOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  await pub.waitForTransactionReceipt({ hash: swapHash });
  txHashes.push(swapHash);

  usdtBalance = await readUsdtBalance(pub, owner);
  const usdtReceived = usdtBalance - usdtBefore;
  const gsAfter = await readGsBalance(pub, owner);
  const gsSpent = gsBalance - gsAfter;

  return {
    swapped: true,
    usdtBalance,
    quote,
    gsSpent,
    usdmReceived,
    usdtReceived,
    txHashes,
  };
}
