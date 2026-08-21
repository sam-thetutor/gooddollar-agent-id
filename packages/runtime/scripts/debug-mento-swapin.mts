#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  getAddress,
  http,
  maxUint256,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const envPath = resolve(
  process.cwd(),
  "../../.goodagent/agents/cmrsdzu5f0000kqqgny5plfwy/skills/chess-arena-player/.env",
);
const pk = readFileSync(envPath, "utf8").match(/^PRIVATE_KEY=(.+)$/m)?.[1]?.trim();
if (!pk) throw new Error("PRIVATE_KEY missing");

const account = privateKeyToAccount(pk as `0x${string}`);
const GS = getAddress("0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A");
const USDM = getAddress("0x765DE816845861e75A25fCA122bb6898B8B1282a");
const BROKER = getAddress("0x88de45906D4F5a57315c133620cfa484cB297541");
const PROVIDER = getAddress("0x2fFBB49055d487DdBBb0C052Cd7c2a02A7971e41");
const EXID =
  "0xba77f5c7bb3317643c6d81d1ef3f9913561741d92095f88efa402faf2cbe9124" as const;

const erc20 = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "s", type: "address" },
      { name: "a", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const broker = [
  {
    name: "swapIn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

async function main(): Promise<void> {
  const pub = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
  const wallet = createWalletClient({
    account,
    chain: celo,
    transport: http("https://forno.celo.org"),
  });
  const amountIn = parseUnits("8700", 18);
  await wallet.writeContract({
    account,
    chain: celo,
    address: GS,
    abi: erc20,
    functionName: "approve",
    args: [BROKER, maxUint256],
  });
  const hash = await wallet.writeContract({
    account,
    chain: celo,
    address: BROKER,
    abi: broker,
    functionName: "swapIn",
    args: [PROVIDER, EXID, GS, USDM, amountIn, parseUnits("0.99", 18)],
  });
  console.log("swapIn tx", hash);
  await pub.waitForTransactionReceipt({ hash });
  const usdm = await pub.readContract({
    address: USDM,
    abi: erc20,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log("USDM balance", formatUnits(usdm, 18));
}

main().catch((e) => {
  console.error(e.shortMessage ?? e.message);
  process.exit(1);
});
