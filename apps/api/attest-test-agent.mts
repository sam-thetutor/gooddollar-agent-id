/** Attest the local test agent via attestFor (agent signs, relayer pays gas). */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  AGENT_ATTESTATION_CELO,
  attestationTypedData,
  getAttestationNonce,
} from "@goodagent/agent-id";

const agentAttestationAbi = [
  {
    type: "function",
    name: "attestFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "provenAt",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const { address, privateKey } = JSON.parse(
  readFileSync(".test-agent.json", "utf8"),
) as { address: `0x${string}`; privateKey: `0x${string}` };

const agent = privateKeyToAccount(privateKey);
const relayer = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const pub = createPublicClient({ chain: celo, transport: http() });
const wallet = createWalletClient({
  account: relayer,
  chain: celo,
  transport: http(),
});

console.log("agent:  ", address);
console.log("relayer:", relayer.address);

const nonce = await getAttestationNonce(address);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const typed = attestationTypedData({ agent: address, nonce, deadline });

// The agent signs — this is the proof of key possession.
const signature = await agent.signTypedData(typed);

// Anyone can relay; the contract recovers the agent from the signature.
const hash = await wallet.writeContract({
  address: AGENT_ATTESTATION_CELO,
  abi: agentAttestationAbi,
  functionName: "attestFor",
  args: [address, deadline, signature],
});
console.log("tx:", hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log("status:", receipt.status, "block:", receipt.blockNumber);

// Confirm (retry a few times for RPC lag).
for (let i = 0; i < 10; i++) {
  const provenAt = (await pub.readContract({
    address: AGENT_ATTESTATION_CELO,
    abi: agentAttestationAbi,
    functionName: "provenAt",
    args: [address],
  })) as bigint;
  if (provenAt !== 0n) {
    console.log("provenAt:", provenAt.toString(), "=> ATTESTED");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
console.log("provenAt still 0 after retries (RPC lag?)");
process.exit(1);
