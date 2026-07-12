/** Attest the Telegram bot agent wallet (apps/telegram-bot/.agent-wallet.json). */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const here = dirname(fileURLToPath(import.meta.url));
const walletPath =
  process.env.AGENT_WALLET_FILE ??
  resolve(here, "../telegram-bot/.agent-wallet.json");

const { address, privateKey } = JSON.parse(
  readFileSync(walletPath, "utf8"),
) as { address: `0x${string}`; privateKey: `0x${string}` };

const relayerPk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (!relayerPk) throw new Error("PRIVATE_KEY missing in .env");

const agent = privateKeyToAccount(privateKey);
const relayer = privateKeyToAccount(relayerPk);
const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo.org";

const pub = createPublicClient({ chain: celo, transport: http(rpc) });
const wallet = createWalletClient({
  account: relayer,
  chain: celo,
  transport: http(rpc),
});

console.log("agent:  ", address);
console.log("relayer:", relayer.address);

const nonce = await getAttestationNonce(address);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const typed = attestationTypedData({ agent: address, nonce, deadline });
const signature = await agent.signTypedData(typed);

const hash = await wallet.writeContract({
  address: AGENT_ATTESTATION_CELO,
  abi: agentAttestationAbi,
  functionName: "attestFor",
  args: [address, deadline, signature],
});
console.log("tx:", hash);
await pub.waitForTransactionReceipt({ hash });

for (let i = 0; i < 10; i++) {
  const provenAt = (await pub.readContract({
    address: AGENT_ATTESTATION_CELO,
    abi: agentAttestationAbi,
    functionName: "provenAt",
    args: [address],
  })) as bigint;
  if (provenAt !== 0n) {
    console.log("provenAt:", provenAt.toString(), "=> ATTESTED");
    console.log(
      "Next: vouch at",
      `https://goodagentids.xyz/issue?agent=${address}`,
    );
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
console.error("provenAt still 0 after retries");
process.exit(1);
