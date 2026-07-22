#!/usr/bin/env node
/** Resume an awaiting_vouch deploy: vouch + start + monitor */
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

const DEPLOY_ID = process.argv[2] ?? "cmrsdzu5f0000kqqgny5plfwy";
const AGENT = (process.argv[3] ??
  "0xf2Bc8a864166E52DbC8307caAeFBb7d752C1501C") as `0x${string}`;
const HOST_BASE = (process.env.HOST_BASE ?? GOODAGENT_HOST_URL).replace(/\/$/, "");
const API_BASE = (process.env.API_BASE ?? GOODAGENT_API_URL).replace(/\/$/, "");
const WEB_ORIGIN = (
  process.env.WEB_ORIGIN ?? "https://goodagentids.xyz"
).replace(/\/$/, "");
const G_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as const;

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

async function hostJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${HOST_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!res.ok) throw new Error(body.error ?? body.message ?? `${res.status} ${path}`);
  return body;
}

async function main() {
  const pk = process.env.OPERATOR_PRIVATE_KEY?.trim() as `0x${string}` | undefined;
  if (!pk) throw new Error("OPERATOR_PRIVATE_KEY missing");

  const operator = privateKeyToAccount(pk);
  const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
  const pub = createPublicClient({ chain: celo, transport: http(rpc) });
  const wallet = createWalletClient({
    account: operator,
    chain: celo,
    transport: http(rpc),
  });

  const attested = await isAgentAttested(AGENT);
  if (!attested) throw new Error("Agent not attested");

  const walletRes = await fetch(`${API_BASE}/wallet/${operator.address}`);
  const walletJson = (await walletRes.json()) as {
    verify?: { isWhitelisted?: boolean; root?: string | null };
  };
  if (!walletJson.verify?.isWhitelisted || !walletJson.verify.root) {
    throw new Error("Operator not verified");
  }
  const humanRoot = walletJson.verify.root as `0x${string}`;

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
  let stake = (await pub.readContract({
    address: AGENT_VAULT_CELO,
    abi: vaultAbi,
    functionName: "stakeOf",
    args: [AGENT],
  })) as bigint;
  console.log("[stake]", stake.toString(), "min", minStake.toString());

  const fields = buildAgentId({
    agent: AGENT,
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
  console.log("[issue]", issueRes.status, JSON.stringify(issueBody));
  if (issueRes.status !== 201) process.exit(1);

  const startAuth = await signControl("resume", DEPLOY_ID, operator);
  await hostJson(`/deploy/${DEPLOY_ID}/start`, {
    method: "POST",
    body: JSON.stringify(startAuth),
  });
  console.log("[start] ok");

  for (let i = 0; i < 30; i++) {
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
    }>(`/deploy/${DEPLOY_ID}/status`);
    const matches = status.stats?.performance?.matches ?? [];
    console.log(
      `[live] status=${status.status} pm2=${status.pm2?.status ?? "-"} matches=${matches.length}`,
    );
    if (matches.length > 0) console.log("[live] latest:", matches[0]);
    if (status.stats?.logTail) {
      console.log(status.stats.logTail.split("\n").slice(-5).join("\n"));
    }
    if (matches.some((m) => m.result === "won" || m.result === "lost")) break;
  }

  console.log("\nwatch:", `${WEB_ORIGIN}/dashboard/${DEPLOY_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
