#!/usr/bin/env node
/**
 * Deploy a GameArena agent via the production host API, vouch, start, and print watch links.
 *
 * Env (monorepo root .env):
 *   OPERATOR_PRIVATE_KEY — owner wallet (must match ownerWallet)
 *   HOST_BASE            — default https://goodagentids.xyz/host
 *   WEB_ORIGIN           — default https://goodagentids.xyz
 *
 * Usage:
 *   pnpm --filter @goodagent/runtime deploy:gamearena-cli
 *   pnpm --filter @goodagent/runtime deploy:gamearena-cli -- --name "MARKOV Fixed Rock"
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, maxUint256 } from "viem";
import { celo } from "viem/chains";
import {
  AGENT_VAULT_CELO,
  agentIdDomain,
  agentIdTypes,
  buildAgentId,
  isAgentAttested,
} from "@goodagent/agent-id";
import { buildDeployControlMessage, GOODAGENT_API_URL, GOODAGENT_HOST_URL } from "@goodagent/shared";

loadEnv({ path: resolve(process.cwd(), "../../.env") });

const HOST_BASE = (process.env.HOST_BASE ?? GOODAGENT_HOST_URL).replace(/\/$/, "");
const API_BASE = (process.env.API_BASE ?? GOODAGENT_API_URL).replace(/\/$/, "");
const WEB_ORIGIN = (
  process.env.WEB_ORIGIN ?? "https://goodagentids.xyz"
).replace(/\/$/, "");
const GAMEARENA_SKILL_ID = "gaming/wagering/gamearena_1v1";
const G_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as const;

function parseArgs(argv: string[]) {
  let displayName = "MARKOV Fixed Rock";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--name" && argv[i + 1]) displayName = argv[++i];
  }
  return { displayName };
}

async function signControl(
  action: "run-pipeline" | "resume",
  deployId: string,
  owner: ReturnType<typeof privateKeyToAccount>,
) {
  const issuedAt = Date.now();
  const message = buildDeployControlMessage(action, deployId, issuedAt);
  const signature = await owner.signMessage({ message });
  return { ownerWallet: owner.address, signature, issuedAt };
}

async function hostJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${HOST_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(body.error ?? body.message ?? `${res.status} ${path}`);
  }
  return body;
}

async function vouchAgent(
  agentAddress: `0x${string}`,
  operator: ReturnType<typeof privateKeyToAccount>,
) {
  const attested = await isAgentAttested(agentAddress);
  if (!attested) throw new Error(`Agent ${agentAddress} not attested yet`);

  const walletRes = await fetch(`${API_BASE}/wallet/${operator.address}`);
  const walletJson = (await walletRes.json()) as {
    verify?: { isWhitelisted?: boolean; root?: string | null };
  };
  if (!walletJson.verify?.isWhitelisted || !walletJson.verify.root) {
    throw new Error("Operator not GoodDollar-verified");
  }
  const humanRoot = walletJson.verify.root as `0x${string}`;

  const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
  const pub = createPublicClient({ chain: celo, transport: http(rpc) });
  const wallet = createWalletClient({
    account: operator,
    chain: celo,
    transport: http(rpc),
  });

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
    console.log("[vouch] staking 250 G$ bond…");
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
    console.log("[vouch] stake tx:", stakeHash);

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
    console.log("[vouch] bond already sufficient");
  }

  const fields = buildAgentId({
    agent: agentAddress,
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

  const issueRes = await fetch(`${API_BASE}/agent/issue`, {
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
  if (issueRes.status !== 201) {
    throw new Error(`issue failed: ${JSON.stringify(issueBody)}`);
  }
  console.log("[vouch] Agent ID issued");
}

async function main() {
  const pk = process.env.OPERATOR_PRIVATE_KEY?.trim() as `0x${string}` | undefined;
  if (!pk) throw new Error("OPERATOR_PRIVATE_KEY missing in .env");

  const operator = privateKeyToAccount(pk);
  const { displayName } = parseArgs(process.argv.slice(2));

  const configuration = {
    PLAY_MODE: "onchain",
    MARKOV_STRATEGY: "fixed",
    RPS_FIXED: "rock",
    WAGER_GS: "1",
    GAME_TYPE: "0",
    DAILY_LOSS_CAP_GS: "10",
    ACCEPT_TIMEOUT_SECONDS: "90",
    MAX_MATCHES: "3",
    MATCH_INTERVAL_SECONDS: "60",
    DAILY_MATCH_CAP: "10",
  };

  console.log(`\n=== GameArena CLI deploy: ${displayName} ===`);
  console.log(`host: ${HOST_BASE}`);
  console.log(`mode: on-chain · strategy: fixed(rock)\n`);

  const { agent } = await hostJson<{ agent: { id: string } }>("/deploy", {
    method: "POST",
    body: JSON.stringify({
      displayName,
      ownerWallet: operator.address,
      skillId: GAMEARENA_SKILL_ID,
      template: "gaming",
      skipPayment: true,
      configuration,
    }),
  });
  const deployId = agent.id;
  console.log("[create] deployId:", deployId);

  const runAuth = await signControl("run-pipeline", deployId, operator);
  await hostJson(`/deploy/${deployId}/run-pipeline`, {
    method: "POST",
    body: JSON.stringify(runAuth),
  });
  console.log("[pipeline] started");

  let agentAddress: string | null = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await hostJson<{
      status: string;
      agentAddress: string | null;
      pipelineRunning: boolean;
      lastError?: string | null;
      pm2?: { online?: boolean; status?: string } | null;
    }>(`/deploy/${deployId}/status`);
    console.log(
      `[status] ${status.status} agent=${status.agentAddress ?? "-"} pipeline=${status.pipelineRunning}`,
    );
    if (status.lastError) console.log("[status] error:", status.lastError);
    agentAddress = status.agentAddress;

    if (status.status === "awaiting_vouch" && agentAddress) break;
    if (status.status === "failed" && !status.pipelineRunning) {
      throw new Error(status.lastError ?? "pipeline failed");
    }
  }
  if (!agentAddress) throw new Error("Timed out waiting for agent address");

  await vouchAgent(agentAddress as `0x${string}`, operator);

  const startAuth = await signControl("resume", deployId, operator);
  await hostJson(`/deploy/${deployId}/start`, {
    method: "POST",
    body: JSON.stringify(startAuth),
  });
  console.log("[start] PM2 agent started");

  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await hostJson<{
      status: string;
      pm2?: { online?: boolean; status?: string } | null;
      stats?: {
        performance?: {
          matches?: Array<{ matchId: string; result: string; mode?: string }>;
        };
        logTail?: string;
      } | null;
    }>(`/deploy/${deployId}/status`);
    const matches = status.stats?.performance?.matches ?? [];
    console.log(
      `[live] status=${status.status} pm2=${status.pm2?.status ?? "-"} matches=${matches.length}`,
    );
    if (matches.length > 0) {
      console.log("[live] latest match:", matches[0]);
    }
    if (status.stats?.logTail) {
      const tail = status.stats.logTail.split("\n").slice(-4).join("\n");
      console.log(tail);
    }
    if (matches.some((m) => m.result === "won" || m.result === "lost")) break;
    if (status.pm2?.online && i >= 18) break;
  }

  const dashboard = `${WEB_ORIGIN}/dashboard/${deployId}`;
  const issue = `${WEB_ORIGIN}/issue?agent=${agentAddress}&deploy=${deployId}`;
  const verify = `${API_BASE}/agent/verify/${agentAddress}`;

  console.log("\n=== ready ===");
  console.log("deployId: ", deployId);
  console.log("agent:    ", agentAddress);
  console.log("watch:    ", dashboard);
  console.log("vouch:    ", issue);
  console.log("verify:   ", verify);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
