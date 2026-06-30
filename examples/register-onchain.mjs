#!/usr/bin/env node
/**
 * GoodDollar Agent ID — on-chain ERC-8004 registration test (SDK-driven).
 *
 * This reproduces *exactly* what an ERC-8004 `IERC8004ProofOfHuman` registry
 * does when an agent registers via `registerWithHumanProof(agentURI, provider,
 * proof, data)`: it calls the GoodDollar provider's `verifyHumanProof(proof,
 * data)` and expects `(verified, nullifier)`.
 *
 * We build `proof` + `data` with the published SDK and call the **deployed**
 * GoodDollarHumanProofProvider on Celo mainnet directly. If your operator wallet
 * is a verified GoodDollar human, you get `verified = true` and a deterministic
 * per-human nullifier — proof the registration primitive works end to end.
 *
 * Run:
 *   OPERATOR_PRIVATE_KEY=0x...   # a GoodDollar face-verified wallet
 *   AGENT_ADDRESS=0x...          # the AI agent's wallet (defaults to a sample)
 *   node register-onchain.mjs
 */
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO,
  humanProofTypedData,
  humanProofDigest,
  encodeHumanProofData,
} from "@goodagent/agent-id";

const line = () => console.log("─".repeat(64));

const pk = process.env.OPERATOR_PRIVATE_KEY;
if (!pk) {
  console.error(
    "Set OPERATOR_PRIVATE_KEY to a GoodDollar-verified wallet's key.\n" +
      "(Verify your wallet at https://wallet.gooddollar.org first.)",
  );
  process.exit(1);
}

const operator = privateKeyToAccount(pk);
const human = operator.address;
const agent =
  process.env.AGENT_ADDRESS ?? "0x2222222222222222222222222222222222222222";

const client = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });

// Minimal slice of the provider's IHumanProofProvider surface.
const providerAbi = [
  {
    type: "function",
    name: "verifyHumanProof",
    stateMutability: "view",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "verified", type: "bool" },
      { name: "nullifier", type: "uint256" },
    ],
  },
  { type: "function", name: "providerName", stateMutability: "pure", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "verificationStrength", stateMutability: "pure", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "proofDigest",
    stateMutability: "view",
    inputs: [
      { name: "human", type: "address" },
      { name: "agent", type: "address" },
    ],
    outputs: [{ type: "bytes32" }],
  },
];

console.log("Provider:", GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO);
console.log("Human (operator):", human);
console.log("Agent:", agent);
line();

// 1. Human signs EIP-712 consent (the `proof`). Built entirely by the SDK.
const typedData = humanProofTypedData(human, agent);
const proof = await operator.signTypedData(typedData);
const data = encodeHumanProofData(human, agent);
console.log("1) Built consent proof + data via the SDK");
console.log("   proof:", proof.slice(0, 26) + "…");
console.log("   data: ", data.slice(0, 26) + "…");

// Sanity: the SDK digest must match the deployed contract's on-chain digest.
const onchainDigest = await client.readContract({
  address: GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO,
  abi: providerAbi,
  functionName: "proofDigest",
  args: [human, agent],
});
const sdkDigest = humanProofDigest(human, agent);
console.log(
  "   SDK digest == on-chain digest:",
  sdkDigest.toLowerCase() === onchainDigest.toLowerCase() ? "✅" : "❌",
);
line();

// 2. Call the provider exactly as a registry would during registerWithHumanProof.
const [name, strength] = await Promise.all([
  client.readContract({ address: GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO, abi: providerAbi, functionName: "providerName" }),
  client.readContract({ address: GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO, abi: providerAbi, functionName: "verificationStrength" }),
]);
const [verified, nullifier] = await client.readContract({
  address: GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO,
  abi: providerAbi,
  functionName: "verifyHumanProof",
  args: [proof, data],
});

console.log(`2) provider "${name}" (strength ${strength}) → verifyHumanProof:`);
if (verified) {
  console.log("   ✅ verified — a real GoodDollar human is behind this agent");
  console.log("   nullifier:", nullifier.toString());
  console.log("\nA registry would now mint the agent and bind this nullifier");
  console.log("(per-human sybil limits are enforced against it).");
} else {
  console.log("   ❌ not verified — operator wallet isn't a GoodDollar-verified human");
  console.log("   Verify it at https://wallet.gooddollar.org, then re-run.");
}
