/**
 * One-shot: register a hosted agent on the ERC-8004 Identity Registry (Celo).
 *
 * Builds a registration file embedding the agent's GoodDollar Proof-of-Human
 * credential, encodes it as a data: URI (fully on-chain metadata), and calls
 * `register(agentURI)` from the agent's own wallet — same flow MARKOV used
 * for token 6386. Gas ≈ 0.02 CELO, paid by the agent wallet.
 *
 * Run on the VPS from packages/runtime:
 *   pnpm exec tsx scripts/register-erc8004-actionorder.mts          # dry run
 *   CONFIRM=1 pnpm exec tsx scripts/register-erc8004-actionorder.mts
 */
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { getAgentCredential, getDeployedAgent } from "@goodagent/db";
import {
  buildErc8004Registration,
  toDataUri,
  ERC8004_IDENTITY_REGISTRY_CELO,
  type AgentIdCredentialWire,
} from "@goodagent/agent-id";
import {
  deriveAgentPrivateKey,
  getRuntimeConfig,
  loadRuntimeEnv,
} from "../src/index.js";

const DEPLOY_ID = process.env.DEPLOY_ID?.trim() || "cmsadg4zq0000dtsldarirvih";
const CONFIRM = process.env.CONFIRM?.trim() === "1";
const RPC_URL = process.env.CELO_RPC_URL?.trim() || "https://forno.celo.org";

const REGISTER_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

loadRuntimeEnv();
const config = getRuntimeConfig();

const agent = await getDeployedAgent(DEPLOY_ID);
if (!agent) throw new Error(`deploy not found: ${DEPLOY_ID}`);
if (!agent.agentAddress || agent.walletDerivationIndex == null) {
  throw new Error("deploy has no provisioned wallet");
}
console.log(`[reg] deploy: ${agent.displayName} (${DEPLOY_ID})`);
console.log(`[reg] agent wallet: ${agent.agentAddress}`);

const cred = await getAgentCredential(agent.agentAddress);
if (!cred) throw new Error(`no GoodDollar credential for ${agent.agentAddress}`);
if (cred.revokedAt) throw new Error("credential is revoked");
const wire: AgentIdCredentialWire = {
  fields: {
    agent: cred.agent,
    operator: cred.operator,
    humanRoot: cred.humanRoot,
    nonce: cred.nonce,
    issuedAt: cred.issuedAt,
    expiresAt: cred.expiresAt,
  },
  signature: cred.signature,
  chainId: cred.chainId,
  verifyingContract: cred.verifyingContract,
};
console.log(`[reg] credential found — operator ${cred.operator}, proven=${cred.agentProven}`);

const MINIMAL = process.env.MINIMAL?.trim() === "1";
const registration = buildErc8004Registration({
  credential: wire,
  name: process.env.REG_NAME?.trim() || agent.displayName,
  description: MINIMAL
    ? `GoodAgent-hosted agent. Verify: https://goodagentids.xyz/verify?agent=${agent.agentAddress}`
    : "GoodAgent-hosted autonomous agent on Celo. Human-backed identity " +
      "(GoodDollar face verification + refundable 250 G$ bond), plays " +
      "ACTION-ORDER card battles and participates in Amplify campaigns. " +
      `Verify: https://goodagentids.xyz/verify?agent=${agent.agentAddress}`,
  services: [
    {
      name: "GoodAgent Verify",
      endpoint: `https://goodagentids.xyz/api/agent/verify/${agent.agentAddress}`,
    },
  ],
});
if (MINIMAL) {
  // Drop the embedded credential to shrink on-chain storage; the verify
  // service endpoint still proves the identity live.
  delete (registration as Record<string, unknown>)["gooddollar-proof-of-human"];
}
const agentURI = toDataUri(registration);
console.log(`[reg] registration URI built (${agentURI.length} bytes)`);

const privateKey = deriveAgentPrivateKey(
  config.deployMnemonic,
  agent.walletDerivationIndex,
);
const account = privateKeyToAccount(privateKey);
if (account.address.toLowerCase() !== agent.agentAddress.toLowerCase()) {
  throw new Error(
    `derived key mismatch: ${account.address} != ${agent.agentAddress}`,
  );
}

const publicClient = createPublicClient({ chain: celo, transport: http(RPC_URL) });
const balance = await publicClient.getBalance({ address: account.address });
console.log(`[reg] CELO balance: ${formatEther(balance)}`);

const { request, result } = await publicClient.simulateContract({
  account,
  address: ERC8004_IDENTITY_REGISTRY_CELO as `0x${string}`,
  abi: REGISTER_ABI,
  functionName: "register",
  args: [agentURI],
});
console.log(`[reg] simulation OK — would mint agentId ${result}`);

if (!CONFIRM) {
  console.log("[reg] dry run complete. Re-run with CONFIRM=1 to send the transaction.");
  process.exit(0);
}

const walletClient = createWalletClient({ account, chain: celo, transport: http(RPC_URL) });
// Explicit gas + fees: cast estimates ~1.35M gas; Celo base fee is high
// (~200 gwei) and viem's default 2x fee buffer pushes the upfront cost past
// the agent's balance, so we pin a tight maxFeePerGas instead.
const gasLimit = BigInt(process.env.REG_GAS?.trim() || "1450000");
const txHash = await walletClient.writeContract({
  ...request,
  gas: gasLimit,
  maxFeePerGas: 250_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
});
console.log(`[reg] tx sent: ${txHash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log(`[reg] status: ${receipt.status}, gas used: ${receipt.gasUsed}`);

const transfers = parseEventLogs({
  abi: REGISTER_ABI,
  eventName: "Transfer",
  logs: receipt.logs,
});
const minted = transfers.find(
  (t) => t.args.to.toLowerCase() === account.address.toLowerCase(),
);
if (minted) {
  console.log(`[reg] ✅ registered — ERC-8004 agentId: ${minted.args.tokenId}`);
  console.log(`[reg] identity: erc8004:celo:${minted.args.tokenId}`);
} else {
  console.log("[reg] tx confirmed but no Transfer event found — check explorer");
}
