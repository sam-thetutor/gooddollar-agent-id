import { formatUnits } from "viem";
import { loadRuntimeEnv, getRuntimeConfig } from "../src/config.js";
import { quoteAgentUsdtFunding } from "../src/agent-usdt-funding.js";
import { quoteGsToUsdt, createSwapPublicClient, usdmForUsdtTarget } from "@goodagent/chain";

const agentArg = process.argv.find((a) => a.startsWith("--agent="));
const agentAddress = agentArg?.slice("--agent=".length) as `0x${string}` | undefined;
const execute = process.argv.includes("--execute");
const targetArg = process.argv.find((a) => a.startsWith("--target-usdt="));
const targetUsdt = targetArg
  ? BigInt(targetArg.slice("--target-usdt=".length))
  : 1_000_000n;

async function main(): Promise<void> {
  loadRuntimeEnv();
  const config = getRuntimeConfig();

  console.log("G$ → USDT swap quote (Celo mainnet)");
  console.log(`target USDT: ${formatUnits(targetUsdt, 6)}`);
  console.log(`usdm equivalent: ${formatUnits(usdmForUsdtTarget(targetUsdt), 18)} USDm`);

  const pub = createSwapPublicClient(config.rpcUrl);
  const quote = await quoteGsToUsdt(pub, targetUsdt);
  console.log("\nFresh-wallet quote (no existing USDT):");
  console.log(`  G$ required (est):  ${formatUnits(quote.gsRequired, 18)}`);
  console.log(`  G$ with slippage:   ${formatUnits(quote.gsRequiredWithSlippage, 18)}`);
  console.log(`  USDm intermediate:  ${formatUnits(quote.usdmNeeded, 18)}`);
  console.log(`  USDT out (est):     ${formatUnits(quote.estimatedUsdtOut, 6)}`);

  if (agentAddress) {
    const live = await quoteAgentUsdtFunding(config, agentAddress, targetUsdt);
    console.log(`\nAgent ${agentAddress}:`);
    console.log(`  current USDT: ${formatUnits(live.currentUsdt, 6)}`);
    if (live.quote.gsRequiredWithSlippage > 0n) {
      console.log(`  G$ to swap:   ${formatUnits(live.quote.gsRequiredWithSlippage, 18)}`);
    } else {
      console.log("  already funded — no swap needed");
    }

    if (execute) {
      const pkArg = process.argv.find((a) => a.startsWith("--private-key="));
      const pk = pkArg?.slice("--private-key=".length) as `0x${string}` | undefined;
      if (!pk) {
        throw new Error("--execute requires --private-key=0x… for the agent wallet");
      }
      const { fundAgentUsdtFromGsByKey } = await import("../src/agent-usdt-funding.js");
      const result = await fundAgentUsdtFromGsByKey(config, agentAddress, pk, {
        targetUsdt,
      });
      console.log("\nExecute result:", result);
    }
  } else {
    console.log("\nPass --agent=0x… to quote against a live wallet.");
    console.log("Add --execute --private-key=0x… to run the swap on-chain.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
