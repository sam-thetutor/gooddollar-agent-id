import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  maxUint256,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { LocalAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  AGENT_VAULT_CELO,
  agentIdDomain,
  agentIdTypes,
  attestAsAgent,
  buildAgentId,
  isAgentAttested,
  relayAgentAttestation,
  signAgentAttestation,
} from "@goodagent/agent-id";
import type { RuntimeConfig } from "./config.js";

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
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
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

function clients(config: RuntimeConfig) {
  const pub = createPublicClient({
    chain: celo,
    transport: http(config.rpcUrl),
  });
  return { pub };
}

export async function fundAgentCelo(
  config: RuntimeConfig,
  agentAddress: Address,
  minCelo = config.agentInitialCelo,
): Promise<Hex | null> {
  const { pub } = clients(config);
  const balance = await pub.getBalance({ address: agentAddress });
  const minWei = parseEther(minCelo);
  if (balance >= minWei) {
    console.log(`[fund] ${agentAddress} already has ${formatEther(balance)} CELO`);
    return null;
  }

  const relayer = privateKeyToAccount(config.relayerPrivateKey);
  const relayerBalance = await pub.getBalance({ address: relayer.address });
  const needed = minWei - balance;

  // Keep a little CELO on the relayer for attestFor gas and future deploys.
  const gasReserve = parseEther("0.01");
  const maxSendable =
    relayerBalance > gasReserve ? relayerBalance - gasReserve : 0n;

  if (maxSendable === 0n) {
    throw new Error(
      `Relayer ${relayer.address} is out of CELO (${formatEther(relayerBalance)}). ` +
        `Top up the PRIVATE_KEY wallet with at least ${formatEther(needed)} CELO.`,
    );
  }

  const topUp = needed <= maxSendable ? needed : maxSendable;
  if (topUp < needed) {
    throw new Error(
      `Relayer ${relayer.address} has ${formatEther(relayerBalance)} CELO but needs ` +
        `${formatEther(needed)} to fund ${agentAddress} (keeping ${formatEther(gasReserve)} for gas). ` +
        `Top up PRIVATE_KEY with more CELO.`,
    );
  }

  const wallet = createWalletClient({
    account: relayer,
    chain: celo,
    transport: http(config.rpcUrl),
  });

  console.log(
    `[fund] sending ${formatEther(topUp)} CELO to ${agentAddress} from ${relayer.address}…`,
  );
  const hash = await wallet.sendTransaction({
    to: agentAddress,
    value: topUp,
  });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`[fund] tx: ${hash}`);
  return hash;
}

export async function fundAgentGDollar(
  config: RuntimeConfig,
  agentAddress: Address,
  minGs = config.agentInitialGs,
): Promise<Hex | null> {
  const { pub } = clients(config);
  const targetWei = parseUnits(String(minGs), 18);

  const balance = (await pub.readContract({
    address: G_DOLLAR,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [agentAddress],
  })) as bigint;

  if (balance >= targetWei) {
    console.log(
      `[fund] ${agentAddress} already has ${formatUnits(balance, 18)} G$`,
    );
    return null;
  }

  const relayer = privateKeyToAccount(config.relayerPrivateKey);
  const relayerBalance = (await pub.readContract({
    address: G_DOLLAR,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [relayer.address],
  })) as bigint;

  const needed = targetWei - balance;
  if (relayerBalance < needed) {
    throw new Error(
      `Relayer ${relayer.address} has ${formatUnits(relayerBalance, 18)} G$ but needs ` +
        `${formatUnits(needed, 18)} to fund ${agentAddress}. Top up PRIVATE_KEY with more G$.`,
    );
  }

  const wallet = createWalletClient({
    account: relayer,
    chain: celo,
    transport: http(config.rpcUrl),
  });

  console.log(
    `[fund] sending ${formatUnits(needed, 18)} G$ to ${agentAddress} from ${relayer.address}…`,
  );
  const hash = await wallet.writeContract({
    address: G_DOLLAR,
    abi: erc20Abi,
    functionName: "transfer",
    args: [agentAddress, needed],
  });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`[fund] G$ tx: ${hash}`);
  return hash;
}

/**
 * Deployed agents must be vouched by the owner wallet (not the platform operator).
 * Checks live Agent ID validity, operator match, attestation, and vault bond.
 */
export async function assertOwnerVouchedForAgent(
  config: RuntimeConfig,
  agentAddress: Address,
  ownerWallet: Address,
): Promise<void> {
  const res = await fetch(`${config.apiBase}/agent/verify/${agentAddress}`);
  if (!res.ok) {
    throw new Error(
      "Agent has no Agent ID yet — vouch with your verified wallet at /issue before going live.",
    );
  }

  const body = (await res.json()) as {
    valid?: boolean;
    reason?: string;
    operator?: string;
  };

  if (!body.valid) {
    const hint =
      body.reason === "not_found"
        ? "Vouch for this agent at /issue using your GoodDollar-verified wallet."
        : `Agent ID is not valid (${body.reason ?? "unknown"}). Complete /issue with your wallet.`;
    throw new Error(hint);
  }

  if (
    !body.operator ||
    body.operator.toLowerCase() !== ownerWallet.toLowerCase()
  ) {
    throw new Error(
      "The Agent ID must be issued from your owner wallet — reconnect with the same wallet you used to deploy and vouch at /issue.",
    );
  }

  await assertAgentPlayReady(config, agentAddress);
}

/** Agent must be attested and carry the full AgentVault bond before wagering. */
export async function assertAgentPlayReady(
  config: RuntimeConfig,
  agentAddress: Address,
): Promise<void> {
  const { pub } = clients(config);

  if (!(await isAgentAttested(agentAddress, { rpcUrl: config.rpcUrl }))) {
    throw new Error(
      "Agent key is not attested — GoodAgent ID verification is required before play",
    );
  }

  const minStake = (await pub.readContract({
    address: AGENT_VAULT_CELO,
    abi: vaultAbi,
    functionName: "minStake",
  })) as bigint;

  const currentStake = (await pub.readContract({
    address: AGENT_VAULT_CELO,
    abi: vaultAbi,
    functionName: "stakeOf",
    args: [agentAddress],
  })) as bigint;

  if (currentStake < minStake) {
    throw new Error(
      `Agent vault bond insufficient (${formatUnits(currentStake, 18)} G$ < ` +
        `${formatUnits(minStake, 18)} G$ required) — lock the refundable bond before play`,
    );
  }
}

export async function relayAttestation(
  config: RuntimeConfig,
  agentAccount: LocalAccount,
): Promise<Hex | null> {
  const { pub } = clients(config);
  const agent = agentAccount.address;

  if (await isAgentAttested(agent, { rpcUrl: config.rpcUrl })) {
    console.log(`[attest] ${agent} already attested`);
    return null;
  }

  const agentBalance = await pub.getBalance({ address: agent });
  const selfAttestMin = parseEther("0.003");
  let hash: Hex;

  // Prefer self-attest when the agent already holds CELO (funded above).
  if (agentBalance >= selfAttestMin) {
    const agentWallet = createWalletClient({
      account: agentAccount,
      chain: celo,
      transport: http(config.rpcUrl),
    });
    console.log(
      `[attest] agent self-attest from ${agent} (${formatEther(agentBalance)} CELO)…`,
    );
    hash = await attestAsAgent(agentWallet);
    await pub.waitForTransactionReceipt({ hash });
    console.log(`[attest] tx: ${hash}`);
  } else {
    const relayer = privateKeyToAccount(config.relayerPrivateKey);
    const relayerBalance = await pub.getBalance({ address: relayer.address });
    const relayGasMin = parseEther("0.005");
    if (relayerBalance < relayGasMin) {
      throw new Error(
        `Relayer ${relayer.address} has ${formatEther(relayerBalance)} CELO — not enough to relay attestation. ` +
          `Either top up PRIVATE_KEY (relayer) or fund the agent with ≥0.003 CELO first.`,
      );
    }

    const relayerWallet = createWalletClient({
      account: relayer,
      chain: celo,
      transport: http(config.rpcUrl),
    });

    const signed = await signAgentAttestation(agentAccount, {
      rpcUrl: config.rpcUrl,
    });
    console.log(`[attest] relaying attestFor for ${agent}…`);
    hash = await relayAgentAttestation(relayerWallet, signed);
    await pub.waitForTransactionReceipt({ hash });
    console.log(`[attest] tx: ${hash}`);
  }

  for (let i = 0; i < 12; i++) {
    if (await isAgentAttested(agent, { rpcUrl: config.rpcUrl })) {
      console.log("[attest] confirmed on-chain");
      return hash;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("attestation not visible after relay");
}

export interface IssueResult {
  issued: boolean;
  verifyUrl: string;
}

interface AgentListResponse {
  activeCount?: number;
  maxPerHuman?: number;
  agents?: Array<{ agent: string; revoked: boolean }>;
}

function formatIssueApiError(status: number, body: Record<string, unknown>): string {
  const code = typeof body.error === "string" ? body.error : "ISSUE_FAILED";
  const message = typeof body.message === "string" ? body.message : null;

  if (code === "AGENT_CAP_REACHED") {
    const active = body.active ?? "?";
    const max = body.max ?? 10;
    return (
      `Agent cap reached (${active}/${max} active agents for this operator). ` +
      "Withdraw a bond on an existing agent at goodagentids.xyz/agents, then retry."
    );
  }
  if (code === "STALE_NONCE") {
    return (
      message ??
      "Credential nonce is stale — wait a moment and retry the deploy."
    );
  }
  if (message) return message;
  return `issue failed: ${status} (${code})`;
}

/** Fail fast before funding if the operator cannot register another agent. */
export async function assertOperatorCanIssueAgent(
  config: RuntimeConfig,
  agentAddress: Address,
): Promise<void> {
  if (!config.operatorPrivateKey) return;

  const operator = privateKeyToAccount(config.operatorPrivateKey).address;
  const verifyRes = await fetch(`${config.apiBase}/agent/verify/${agentAddress}`);
  if (verifyRes.ok) {
    const verifyBody = (await verifyRes.json()) as { valid?: boolean };
    if (verifyBody.valid) return;
  }

  const listRes = await fetch(
    `${config.apiBase}/agent/list?operator=${operator}`,
  );
  if (!listRes.ok) return;

  const list = (await listRes.json()) as AgentListResponse;
  const active = list.activeCount ?? 0;
  const max = list.maxPerHuman ?? 10;
  const alreadyRegistered = list.agents?.some(
    (row) =>
      row.agent.toLowerCase() === agentAddress.toLowerCase() && !row.revoked,
  );
  if (alreadyRegistered || active < max) return;

  throw new Error(
    `Agent cap reached (${active}/${max} active agents for operator ${operator}). ` +
      "Withdraw a bond on an existing agent at goodagentids.xyz/agents, then retry.",
  );
}

export async function issueAgentCredential(
  config: RuntimeConfig,
  agentAddress: Address,
  opts?: { required?: boolean },
): Promise<IssueResult> {
  if (!config.operatorPrivateKey) {
    const verifyUrl = `${config.apiBase.replace(/\/$/, "")}/agent/verify/${agentAddress}`;
    if (opts?.required) {
      throw new Error(
        "OPERATOR_PRIVATE_KEY not set — cannot lock the 250 G$ AgentVault bond",
      );
    }
    console.warn("[issue] OPERATOR_PRIVATE_KEY not set — skip bond + credential");
    return { issued: false, verifyUrl };
  }

  const operator = privateKeyToAccount(config.operatorPrivateKey);
  const verifyUrl = `${config.apiBase.replace(/\/$/, "")}/agent/verify/${agentAddress}`;

  const existingVerify = await fetch(verifyUrl);
  if (existingVerify.ok) {
    const existingBody = (await existingVerify.json()) as { valid?: boolean };
    if (existingBody.valid) {
      console.log(`[issue] ${agentAddress} already has a valid Agent ID — skip`);
      return { issued: true, verifyUrl };
    }
  }

  await assertOperatorCanIssueAgent(config, agentAddress);

  const { pub } = clients(config);
  const wallet = createWalletClient({
    account: operator,
    chain: celo,
    transport: http(config.rpcUrl),
  });

  const walletRes = await fetch(`${config.apiBase}/wallet/${operator.address}`);
  const walletJson = (await walletRes.json()) as {
    verify?: { isWhitelisted?: boolean; root?: string | null };
  };
  if (!walletJson.verify?.isWhitelisted || !walletJson.verify.root) {
    throw new Error(`Operator ${operator.address} is not GoodDollar-verified`);
  }
  const humanRoot = walletJson.verify.root as Address;

  const minStake = (await pub.readContract({
    address: AGENT_VAULT_CELO,
    abi: vaultAbi,
    functionName: "minStake",
  })) as bigint;

  const currentStake = (await pub.readContract({
    address: AGENT_VAULT_CELO,
    abi: vaultAbi,
    functionName: "stakeOf",
    args: [agentAddress],
  })) as bigint;

  if (currentStake < minStake) {
    console.log(`[issue] staking ${minStake.toString()} G$ base units…`);
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
      args: [agentAddress, minStake],
    });
    await pub.waitForTransactionReceipt({ hash: stakeHash });
    console.log(`[issue] stake tx: ${stakeHash}`);

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const stake = (await pub.readContract({
        address: AGENT_VAULT_CELO,
        abi: vaultAbi,
        functionName: "stakeOf",
        args: [agentAddress],
      })) as bigint;
      if (stake >= minStake) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  } else {
    console.log(`[issue] bond already sufficient: ${currentStake.toString()}`);
  }

  const fields = buildAgentId({
    agent: agentAddress,
    operator: operator.address,
    humanRoot,
    ttlSeconds: BigInt(365 * 24 * 60 * 60),
    nonce: BigInt(Date.now()),
  });

  const domain = agentIdDomain();
  const signature = await operator.signTypedData({
    domain,
    types: agentIdTypes,
    primaryType: "AgentID",
    message: fields,
  });

  const issueRes = await fetch(`${config.apiBase}/agent/issue`, {
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

  const body = (await issueRes.json()) as Record<string, unknown>;
  console.log(`[issue] ${issueRes.status}`, JSON.stringify(body));
  if (issueRes.status !== 201) {
    throw new Error(formatIssueApiError(issueRes.status, body));
  }

  const verifyRes = await fetch(`${config.apiBase}/agent/verify/${agentAddress}`);
  const verifyBody = await verifyRes.json();
  console.log("[verify]", JSON.stringify(verifyBody));

  return {
    issued: true,
    verifyUrl: `https://goodagentids.xyz/verify?agent=${agentAddress}`,
  };
}
