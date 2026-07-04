/**
 * Live test of the agent-first registration gate on the production API.
 * The operator key here (deployer) is NOT GoodDollar-verified, so a fully
 * successful issue is impossible — which lets us safely probe gate ordering:
 *
 *  1. unattested agent, no proof   -> 403 AGENT_NOT_ATTESTED (gate fires first)
 *  2. on-chain attested agent      -> gate passes -> INVALID_CREDENTIAL
 *                                     (operator_not_verified) further down
 *  3. unattested agent + agentProof-> gate passes via proof -> INVALID_CREDENTIAL
 *  4. unattested agent + FORGED proof -> 400 BAD_AGENT_PROOF
 */
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  agentIdDomain,
  agentIdTypes,
  buildAgentId,
  buildAgentAuth,
  signAgentAuth,
} from "@goodagent/agent-id";

const PK = process.env.PRIVATE_KEY as `0x${string}`;
if (!PK) throw new Error("PRIVATE_KEY missing");
const operator = privateKeyToAccount(PK);
const API = process.env.API_BASE ?? "https://gcopilot-api.geinz.lol";
const ATTESTED_AGENT = "0xE8b726e2b481Ab39DE783c50906d96f3D703E2cc" as const; // attested earlier

function step(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function tryIssue(agent: `0x${string}`, agentProof?: unknown) {
  const fields = buildAgentId({
    agent,
    operator: operator.address,
    humanRoot: operator.address,
    nonce: BigInt(Math.floor(Date.now() / 1000)),
  });
  const domain = agentIdDomain();
  const signature = await operator.signTypedData({
    domain,
    types: agentIdTypes,
    primaryType: "AgentID",
    message: fields,
  });
  const res = await fetch(`${API}/agent/issue`, {
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
      ...(agentProof ? { agentProof } : {}),
    }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

// 1. Unattested agent, no proof -> gate must reject first.
{
  const random = privateKeyToAccount(generatePrivateKey());
  const r = await tryIssue(random.address);
  step(
    "unattested agent rejected with AGENT_NOT_ATTESTED",
    r.status === 403 && r.body.error === "AGENT_NOT_ATTESTED",
    `status=${r.status} error=${String(r.body.error)}`,
  );
}

// 2. On-chain attested agent -> gate passes, fails later on the unverified human.
{
  const r = await tryIssue(ATTESTED_AGENT);
  step(
    "attested agent passes the gate (fails later on operator_not_verified)",
    r.status === 400 &&
      r.body.error === "INVALID_CREDENTIAL" &&
      r.body.reason === "operator_not_verified",
    `status=${r.status} error=${String(r.body.error)} reason=${String(r.body.reason)}`,
  );
}

// 3. Unattested agent + valid agentProof -> gate passes via the proof path.
{
  const fresh = privateKeyToAccount(generatePrivateKey());
  const proof = await signAgentAuth(
    fresh,
    buildAgentAuth({
      agent: fresh.address,
      audience: "gooddollar-agent-id:register",
    }),
  );
  const r = await tryIssue(fresh.address, proof);
  step(
    "valid agentProof passes the gate (fails later on operator_not_verified)",
    r.status === 400 &&
      r.body.error === "INVALID_CREDENTIAL" &&
      r.body.reason === "operator_not_verified",
    `status=${r.status} error=${String(r.body.error)} reason=${String(r.body.reason)}`,
  );
}

// 4. Forged agentProof (signed by a different key) -> rejected.
{
  const victim = privateKeyToAccount(generatePrivateKey());
  const attacker = privateKeyToAccount(generatePrivateKey());
  const forged = await signAgentAuth(
    attacker,
    buildAgentAuth({
      agent: attacker.address,
      audience: "gooddollar-agent-id:register",
    }),
  );
  const r = await tryIssue(victim.address, { ...forged, agent: victim.address });
  step(
    "forged agentProof rejected with BAD_AGENT_PROOF",
    r.status === 400 && r.body.error === "BAD_AGENT_PROOF",
    `status=${r.status} error=${String(r.body.error)} reason=${String(r.body.reason)}`,
  );
}

console.log("\ndone.");
