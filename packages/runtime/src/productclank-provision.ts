import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  buildErc8004Registration,
  toDataUri,
  ERC8004_IDENTITY_REGISTRY_CELO,
  type AgentIdCredentialWire,
} from "@goodagent/agent-id";
import { getAgentCredential } from "@goodagent/db";
import type { RuntimeConfig } from "./config.js";
import { readAgentMeta, writeAgentMeta } from "./wallet.js";

export const PRODUCTCLANK_SKILL_ID = "work/social/productclank_participant";

const PRODUCTCLANK_API_BASE = "https://api.productclank.com/api/v1";

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

/**
 * Ensure the agent has an ERC-8004 Identity Registry token on Celo, minting
 * one from the agent's own wallet if needed. The minted id is persisted to the
 * agent's meta.json so re-provisions never re-mint. Returns the token id.
 *
 * When the GoodDollar credential exists (owner has vouched), it is embedded in
 * the registration file; otherwise a minimal registration is used that points
 * at the live verify endpoint. Either way the agent is a first-class ERC-8004
 * identity.
 */
export async function ensureErc8004AgentId(
  config: RuntimeConfig,
  input: {
    deployId: string;
    displayName: string;
    agentAddress: Address;
    agentPrivateKey: Hex;
  },
): Promise<string> {
  const meta = readAgentMeta(config.agentsRoot, input.deployId);
  if (meta.erc8004AgentId) {
    console.log(
      `[erc8004] ${input.agentAddress} already registered as ${meta.erc8004AgentId} — reuse`,
    );
    return meta.erc8004AgentId;
  }

  const account = privateKeyToAccount(input.agentPrivateKey);
  if (account.address.toLowerCase() !== input.agentAddress.toLowerCase()) {
    throw new Error(
      `[erc8004] derived key ${account.address} != agent ${input.agentAddress}`,
    );
  }

  const publicClient = createPublicClient({
    chain: celo,
    transport: http(config.rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: celo,
    transport: http(config.rpcUrl),
  });

  const registration = await buildRegistrationFile(
    config,
    input.displayName,
    input.agentAddress,
  );
  const agentURI = toDataUri(registration);

  const { result } = await publicClient.simulateContract({
    account,
    address: ERC8004_IDENTITY_REGISTRY_CELO as Address,
    abi: REGISTER_ABI,
    functionName: "register",
    args: [agentURI],
  });

  const balance = await publicClient.getBalance({ address: account.address });
  const gasPrice = await publicClient.getGasPrice();
  // Explicit gas: Celo's high base fee makes viem's default 2x fee buffer
  // occasionally exceed the wallet balance; pin a tight ceiling instead.
  const maxFeePerGas = gasPrice + gasPrice / 4n;
  const gasEstimate = await publicClient
    .estimateContractGas({
      account,
      address: ERC8004_IDENTITY_REGISTRY_CELO as Address,
      abi: REGISTER_ABI,
      functionName: "register",
      args: [agentURI],
    })
    // Some RPCs reject estimation when balance < gas*gasPrice; fall back to
    // the observed ceiling for a credential-embedded registration (~1.35M).
    .catch(() => 1_450_000n);
  const gasLimit = gasEstimate + gasEstimate / 4n;
  const upfront = gasLimit * maxFeePerGas;
  if (balance < upfront) {
    throw new Error(
      `[erc8004] agent ${input.agentAddress} has ${formatEther(balance)} CELO, ` +
        `needs ~${formatEther(upfront)} for registration gas`,
    );
  }

  const txHash = await walletClient.writeContract({
    address: ERC8004_IDENTITY_REGISTRY_CELO as Address,
    abi: REGISTER_ABI,
    functionName: "register",
    args: [agentURI],
    gas: gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`[erc8004] registration tx reverted: ${txHash}`);
  }

  const transfers = parseEventLogs({
    abi: REGISTER_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
  });
  const minted = transfers.find(
    (t) => t.args.to.toLowerCase() === account.address.toLowerCase(),
  );
  const agentId = (minted?.args.tokenId ?? result).toString();

  writeAgentMeta(config.agentsRoot, {
    ...meta,
    erc8004AgentId: agentId,
    erc8004RegisteredAt: new Date().toISOString(),
  });
  console.log(`[erc8004] registered ${input.agentAddress} as erc8004:celo:${agentId}`);
  return agentId;
}

async function buildRegistrationFile(
  config: RuntimeConfig,
  displayName: string,
  agentAddress: Address,
) {
  const verifyUrl = `${config.apiBase.replace(/\/$/, "")}/agent/verify/${agentAddress}`;
  const cred = await getAgentCredential(agentAddress).catch(() => null);

  if (cred && !cred.revokedAt) {
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
    return buildErc8004Registration({
      credential: wire,
      name: displayName,
      description:
        "GoodAgent-hosted autonomous agent on Celo. Human-backed identity " +
        `(GoodDollar face verification + refundable 250 G$ bond). Verify: ${verifyUrl}`,
      services: [{ name: "GoodAgent Verify", endpoint: verifyUrl }],
    });
  }

  // No credential yet (owner has not vouched): minimal on-chain metadata that
  // still resolves identity live via the verify endpoint.
  const registration = buildErc8004Registration({
    credential: {
      fields: {
        agent: agentAddress,
        operator: agentAddress,
        humanRoot: agentAddress,
        nonce: "0",
        issuedAt: "0",
        expiresAt: "0",
      },
      signature: "0x",
      chainId: 42220,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    name: displayName,
    description: `GoodAgent-hosted agent. Verify: ${verifyUrl}`,
    services: [{ name: "GoodAgent Verify", endpoint: verifyUrl }],
  });
  delete (registration as Record<string, unknown>)["gooddollar-proof-of-human"];
  return registration;
}

export interface ProductClankRegistration {
  apiKey: string;
  productClankAgentId: string;
}

/**
 * Register the agent with ProductClank and return the API key. ProductClank
 * shows the key exactly once, so the caller MUST persist it. The X handle,
 * wallet, and ERC-8004 id are bound permanently at registration.
 */
export async function registerWithProductClank(input: {
  displayName: string;
  agentAddress: Address;
  erc8004AgentId: string;
  xHandle: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProductClankRegistration> {
  const fetchFn = input.fetchImpl ?? fetch;
  const base = (input.apiBase ?? PRODUCTCLANK_API_BASE).replace(/\/$/, "");
  const xHandle = input.xHandle.trim().replace(/^@/, "");
  if (!xHandle) {
    throw new Error("[productclank] X handle is required for registration");
  }

  const res = await fetchFn(`${base}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.displayName,
      x_handle: xHandle,
      wallet_address: input.agentAddress,
      erc8004_agent_id: input.erc8004AgentId,
      description:
        "GoodAgent-hosted autonomous agent with human-backed ERC-8004 identity " +
        "(GoodDollar face verification + 250 G$ bond on Celo).",
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | {
        success?: boolean;
        error?: string;
        message?: string;
        api_key?: string;
        agent?: { id?: string };
      }
    | null;

  if (!res.ok || !body?.success || !body.api_key) {
    throw new Error(
      `[productclank] registration failed (HTTP ${res.status}): ${
        body?.message ?? body?.error ?? "unknown error"
      }`,
    );
  }

  return {
    apiKey: body.api_key,
    productClankAgentId: body.agent?.id ?? "",
  };
}
