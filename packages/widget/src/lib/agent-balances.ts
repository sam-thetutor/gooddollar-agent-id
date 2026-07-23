import {
  createPublicClient,
  formatEther,
  formatUnits,
  http,
  type Address,
} from "viem";
import { celo } from "viem/chains";

const G_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export interface AgentBalanceDisplay {
  gDollarFormatted: string;
  celoFormatted: string;
}

export async function fetchAgentBalancesDisplay(
  rpcUrl: string,
  agentAddress: Address,
): Promise<AgentBalanceDisplay> {
  const client = createPublicClient({
    chain: celo,
    transport: http(rpcUrl),
  });

  const [celoWei, gWei] = await Promise.all([
    client.getBalance({ address: agentAddress }),
    client.readContract({
      address: G_DOLLAR,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [agentAddress],
    }),
  ]);

  return {
    celoFormatted: formatEther(celoWei),
    gDollarFormatted: formatUnits(gWei, 18),
  };
}
