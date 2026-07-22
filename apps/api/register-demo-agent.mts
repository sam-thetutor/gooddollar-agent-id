/**
 * Complete demo-agent registration on Celo mainnet:
 *   1. Confirm on-chain attestation (agent must have attested first)
 *   2. Operator approves + stakes 250 G$ in AgentVault
 *   3. Operator signs EIP-712 credential and POSTs to /agent/issue
 *
 * Env:
 *   OPERATOR_PRIVATE_KEY  — GoodDollar-verified human with >= 250 G$ on Celo
 *   DEMO_AGENT_ADDRESS    — agent to register (default: canonical demo)
 *   API_BASE              — default https://goodagentids.xyz/api
 *
 * Run from apps/api:
 *   OPERATOR_PRIVATE_KEY=0x… npx tsx register-demo-agent.mts
 */
import { createPublicClient, createWalletClient, http, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  AGENT_VAULT_CELO,
  agentIdDomain,
  agentIdTypes,
  buildAgentId,
  isAgentAttested,
} from "@goodagent/agent-id";
import { GOODAGENT_API_URL } from "@goodagent/shared";

const API = process.env.API_BASE ?? GOODAGENT_API_URL;
const DEMO_AGENT =
  (process.env.DEMO_AGENT_ADDRESS as `0x${string}` | undefined) ??
  ("0xBd4495328ac79B2E4A4B488Eb0D4b3548833Ad2A" as const);

const operatorPk = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
if (!operatorPk) {
  console.error(
    "OPERATOR_PRIVATE_KEY missing — set a GoodDollar-verified operator key.",
  );
  console.error(
    "Or complete registration in the browser:",
    `https://goodagentids.xyz/issue?agent=${DEMO_AGENT}`,
  );
  process.exit(1);
}

const G_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as const;
const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const vaultAbi = [
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "stakeOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const operator = privateKeyToAccount(operatorPk);
const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
const pub = createPublicClient({ chain: celo, transport: http(rpc) });
const wallet = createWalletClient({
  account: operator,
  chain: celo,
  transport: http(rpc),
});

console.log("operator:", operator.address);
console.log("agent:   ", DEMO_AGENT);

// --- 1. Attestation gate ---------------------------------------------------
const attested = await isAgentAttested(DEMO_AGENT);
if (!attested) {
  console.error("Agent is NOT attested on-chain. Run attest-test-agent.mts first.");
  process.exit(1);
}
console.log("attestation: OK");

// --- 2. Operator GoodDollar status -----------------------------------------
const walletRes = await fetch(`${API}/wallet/${operator.address}`);
const walletJson = (await walletRes.json()) as {
  verify?: { isWhitelisted?: boolean; root?: string | null };
  balance?: { balance?: string };
};
if (!walletJson.verify?.isWhitelisted || !walletJson.verify.root) {
  console.error("Operator is not GoodDollar-verified:", walletJson.verify);
  process.exit(1);
}
const humanRoot = walletJson.verify.root as `0x${string}`;
console.log("humanRoot:", humanRoot);

const minStake = (await pub.readContract({
  address: AGENT_VAULT_CELO,
  abi: vaultAbi,
  functionName: "minStake",
})) as bigint;

const currentStake = (await pub.readContract({
  address: AGENT_VAULT_CELO,
  abi: vaultAbi,
  functionName: "stakeOf",
  args: [DEMO_AGENT],
})) as bigint;

if (currentStake < minStake) {
  console.log(`staking ${minStake} G$ (base units)…`);
  const approveHash = await wallet.writeContract({
    address: G_DOLLAR,
    abi: erc20Abi,
    functionName: "approve",
    args: [AGENT_VAULT_CELO, maxUint256],
  });
  await pub.waitForTransactionReceipt({ hash: approveHash });

  const stakeHash = await wallet.writeContract({
    address: AGENT_VAULT_CELO,
    abi: vaultAbi,
    functionName: "stake",
    args: [DEMO_AGENT, minStake],
  });
  await pub.waitForTransactionReceipt({ hash: stakeHash });
  console.log("stake tx:", stakeHash);
} else {
  console.log("bond already meets minimum:", currentStake.toString());
}

// --- 3. Issue credential ---------------------------------------------------
const fields = buildAgentId({
  agent: DEMO_AGENT,
  operator: operator.address,
  humanRoot,
  ttlDays: 365,
  nonce: BigInt(Math.floor(Date.now() / 1000)),
});

const domain = agentIdDomain();
const signature = await operator.signTypedData({
  domain,
  types: agentIdTypes,
  primaryType: "AgentID",
  message: fields,
});

const issueRes = await fetch(`${API}/agent/issue`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    fields: {
      agent: fields.agent,
      operator: fields.operator,
      humanRoot: fields.humanRoot,
      nonce: fields.nonce.toString(),
      issuedAt: fields.issuedAt.toString(),
      expiresAt: fields.expiresAt.toString(),
    },
    signature,
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract,
  }),
});

const issueBody = await issueRes.json();
console.log("issue:", issueRes.status, JSON.stringify(issueBody, null, 2));
if (issueRes.status !== 201) process.exit(1);

// --- 4. Verify live --------------------------------------------------------
const verifyRes = await fetch(`${API}/agent/verify/${DEMO_AGENT}`);
const verifyBody = await verifyRes.json();
console.log("verify:", JSON.stringify(verifyBody, null, 2));

const ok =
  verifyBody.found === true &&
  verifyBody.valid === true &&
  verifyBody.agentProven === true;
console.log(ok ? "\nDemo agent LIVE with agentProven: true" : "\nVerify check failed");
process.exit(ok ? 0 : 1);
