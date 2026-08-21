import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  formatUnits,
  getAddress,
  http,
  maxUint256,
  parseAbiParameters,
  parseUnits,
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
  PERMIT2_CELO,
  UNISWAP_GS_USDM_FEE,
  UNISWAP_QUOTER_CELO,
  UNISWAP_UNIVERSAL_ROUTER_CELO,
  UNISWAP_USDM_USDT_FEE,
} from "./swap-addresses.js";
import {
  erc20SwapAbi,
  permit2Abi,
  UNISWAP_V3_SWAP_EXACT_IN_COMMAND,
  uniswapQuoterExactInputAbi,
  uniswapUniversalRouterAbi,
} from "./swap-abis.js";

const BPS = 10_000n;
const PERMIT2_MAX_AMOUNT = 2n ** 160n - 1n;

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

/** Encode a Uniswap V3 path: tokenIn, fee, tokenOut [, fee, tokenOut …]. */
export function encodeUniswapPath(tokens: Address[], fees: number[]): Hex {
  if (tokens.length !== fees.length + 1) {
    throw new Error("encodeUniswapPath: tokens.length must be fees.length + 1");
  }
  let encoded = tokens[0].slice(2).toLowerCase();
  for (let i = 0; i < fees.length; i++) {
    encoded += fees[i]!.toString(16).padStart(6, "0");
    encoded += tokens[i + 1]!.slice(2).toLowerCase();
  }
  return `0x${encoded}` as Hex;
}

function tokenInFromPath(path: Hex): Address {
  return getAddress(`0x${path.slice(2, 42)}`);
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

export async function readUsdmBalance(
  pub: PublicClient<HttpTransport, typeof celo>,
  account: Address,
): Promise<bigint> {
  return pub.readContract({
    address: USDM_CELO,
    abi: erc20SwapAbi,
    functionName: "balanceOf",
    args: [account],
  });
}

async function quoteUniswapExactIn(
  pub: PublicClient<HttpTransport, typeof celo>,
  path: Hex,
  amountIn: bigint,
): Promise<bigint> {
  const amountOut = await pub.readContract({
    address: UNISWAP_QUOTER_CELO,
    abi: uniswapQuoterExactInputAbi,
    functionName: "quoteExactInput",
    args: [path, amountIn],
  });
  return amountOut;
}

/** Binary-search G$ input for a target USDm output on Uniswap V3. */
async function quoteGsForUsdm(
  pub: PublicClient<HttpTransport, typeof celo>,
  usdmNeeded: bigint,
): Promise<bigint> {
  if (usdmNeeded <= 0n) return 0n;

  const path = encodeUniswapPath([G_DOLLAR_CELO, USDM_CELO], [UNISWAP_GS_USDM_FEE]);
  let lo = 1n;
  let hi = parseUnits("50000", 18);

  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const usdmOut = await quoteUniswapExactIn(pub, path, mid);
    if (usdmOut >= usdmNeeded) hi = mid;
    else lo = mid + 1n;
  }

  return lo;
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
  const gsRequired = await quoteGsForUsdm(pub, usdmNeeded);
  const gsRequiredWithSlippage = applySlippageUp(gsRequired, slippageBps);

  const gsToUsdmPath = encodeUniswapPath(
    [G_DOLLAR_CELO, USDM_CELO],
    [UNISWAP_GS_USDM_FEE],
  );
  const usdmOut = await quoteUniswapExactIn(pub, gsToUsdmPath, gsRequired);
  const usdmToUsdtPath = encodeUniswapPath(
    [USDM_CELO, USDT_CELO],
    [UNISWAP_USDM_USDT_FEE],
  );
  const estimatedUsdtOut = await quoteUniswapExactIn(pub, usdmToUsdtPath, usdmOut);

  return {
    usdtShortfall,
    usdmNeeded,
    gsRequired,
    gsRequiredWithSlippage,
    estimatedUsdtOut,
  };
}

async function ensurePermit2Allowance(
  wallet: WalletClient<HttpTransport, typeof celo, LocalAccount>,
  pub: PublicClient<HttpTransport, typeof celo>,
  token: Address,
  owner: Address,
  amount: bigint,
): Promise<Hex[]> {
  const txHashes: Hex[] = [];
  const erc20Allowance = await pub.readContract({
    address: token,
    abi: erc20SwapAbi,
    functionName: "allowance",
    args: [owner, PERMIT2_CELO],
  });
  if (erc20Allowance < amount) {
    const hash = await wallet.writeContract({
      account: wallet.account,
      chain: celo,
      address: token,
      abi: erc20SwapAbi,
      functionName: "approve",
      args: [PERMIT2_CELO, maxUint256],
    });
    await pub.waitForTransactionReceipt({ hash });
    txHashes.push(hash);
  }

  const [permit2Amount] = await pub.readContract({
    address: PERMIT2_CELO,
    abi: permit2Abi,
    functionName: "allowance",
    args: [owner, token, UNISWAP_UNIVERSAL_ROUTER_CELO],
  });
  if (permit2Amount < amount) {
    const expiration = Math.floor(Date.now() / 1000) + 86400 * 30;
    const hash = await wallet.writeContract({
      account: wallet.account,
      chain: celo,
      address: PERMIT2_CELO,
      abi: permit2Abi,
      functionName: "approve",
      args: [token, UNISWAP_UNIVERSAL_ROUTER_CELO, PERMIT2_MAX_AMOUNT, expiration],
    });
    await pub.waitForTransactionReceipt({ hash });
    txHashes.push(hash);
  }

  return txHashes;
}

async function universalV3SwapExactIn(
  wallet: WalletClient<HttpTransport, typeof celo, LocalAccount>,
  pub: PublicClient<HttpTransport, typeof celo>,
  owner: Address,
  path: Hex,
  amountIn: bigint,
  amountOutMinimum: bigint,
  txHashes: Hex[],
): Promise<Hex> {
  const tokenIn = tokenInFromPath(path);
  txHashes.push(
    ...(await ensurePermit2Allowance(wallet, pub, tokenIn, owner, amountIn)),
  );

  const swapInput = encodeAbiParameters(
    parseAbiParameters(
      "address recipient, uint256 amountIn, uint256 amountOutMinimum, bytes path, bool payerIsUser",
    ),
    [owner, amountIn, amountOutMinimum, path, true],
  );
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const hash = await wallet.writeContract({
    account: wallet.account,
    chain: celo,
    address: UNISWAP_UNIVERSAL_ROUTER_CELO,
    abi: uniswapUniversalRouterAbi,
    functionName: "execute",
    args: [UNISWAP_V3_SWAP_EXACT_IN_COMMAND, [swapInput], deadline],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Uniswap swap reverted: ${hash}`);
  }
  return hash;
}

/**
 * Swap G$ → USDm → USDT via Uniswap Universal Router until the wallet holds at
 * least `targetUsdt` atomic units (6 decimals).
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

  const txHashes: Hex[] = [];
  let gsSpent = 0n;
  let usdmReceived = 0n;

  // Swap any existing USDm before spending more G$.
  let usdmBalance = await readUsdmBalance(pub, owner);
  if (usdmBalance > 0n) {
    const usdtBeforeUsdmSwap = usdtBalance;
    const usdmToUsdtPath = encodeUniswapPath(
      [USDM_CELO, USDT_CELO],
      [UNISWAP_USDM_USDT_FEE],
    );
    const usdtSwapHash = await universalV3SwapExactIn(
      wallet,
      pub,
      owner,
      usdmToUsdtPath,
      usdmBalance,
      0n,
      txHashes,
    );
    txHashes.push(usdtSwapHash);
    usdtBalance = await readUsdtBalance(pub, owner);
    usdmBalance = 0n;
    if (usdtBalance >= targetUsdt) {
      return {
        swapped: true,
        usdtBalance,
        usdtReceived: usdtBalance - usdtBeforeUsdmSwap,
        txHashes,
      };
    }
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

  const gsIn = quote.gsRequiredWithSlippage;
  const minUsdmOut = applySlippageDown(quote.usdmNeeded, slippageBps);
  const gsToUsdmPath = encodeUniswapPath(
    [G_DOLLAR_CELO, USDM_CELO],
    [UNISWAP_GS_USDM_FEE],
  );

  const gsSwapHash = await universalV3SwapExactIn(
    wallet,
    pub,
    owner,
    gsToUsdmPath,
    gsIn,
    minUsdmOut,
    txHashes,
  );
  txHashes.push(gsSwapHash);

  usdmBalance = await readUsdmBalance(pub, owner);
  if (usdmBalance <= 0n) {
    throw new Error("Uniswap G$ → USDm swap produced no USDm");
  }
  usdmReceived = usdmBalance;

  const usdtBefore = usdtBalance;
  const usdmToUsdtPath = encodeUniswapPath(
    [USDM_CELO, USDT_CELO],
    [UNISWAP_USDM_USDT_FEE],
  );

  const usdtSwapHash = await universalV3SwapExactIn(
    wallet,
    pub,
    owner,
    usdmToUsdtPath,
    usdmBalance,
    0n,
    txHashes,
  );
  txHashes.push(usdtSwapHash);

  usdtBalance = await readUsdtBalance(pub, owner);
  const usdtReceived = usdtBalance - usdtBefore;
  const gsAfter = await readGsBalance(pub, owner);
  gsSpent = gsBalance - gsAfter;

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
