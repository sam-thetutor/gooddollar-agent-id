import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const AGENT_REVOCATION = "0xA86a133626989115a6499b6cA67c3c8dA1662137" as Address;
const RPC = process.env.CELO_RPC_URL?.trim() || "https://forno.celo.org";

const agents = process.argv.slice(2) as Address[];
if (!agents.length) {
  console.error("Usage: revoke-onchain.mts <agent> [...]");
  process.exit(1);
}

async function main() {
  const pk = process.env.OPERATOR_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("OPERATOR_PRIVATE_KEY missing");

  const account = privateKeyToAccount(pk);
  const pub = createPublicClient({ chain: celo, transport: http(RPC) });
  const wallet = createWalletClient({
    account,
    chain: celo,
    transport: http(RPC),
  });

  const abi = [
    {
      type: "function",
      name: "revoke",
      inputs: [{ name: "agent", type: "address" }],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "function",
      name: "isRevoked",
      inputs: [{ name: "agent", type: "address" }],
      outputs: [{ type: "bool" }],
      stateMutability: "view",
    },
  ] as const;

  for (const agent of agents) {
    const already = await pub.readContract({
      address: AGENT_REVOCATION,
      abi,
      functionName: "isRevoked",
      args: [agent],
    });
    if (already) {
      console.log(`on-chain already revoked: ${agent}`);
      continue;
    }
    const hash = await wallet.writeContract({
      address: AGENT_REVOCATION,
      abi,
      functionName: "revoke",
      args: [agent],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`on-chain revoked ${agent} tx ${hash}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
