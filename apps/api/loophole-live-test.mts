/**
 * Live test for the L1/L2/L3 fixes, with REAL Celo mainnet transactions:
 *  - L3: verifyAgentIdLive default-on checks (bondChecked/revocationChecked)
 *  - L2: on-chain revoke via AgentRevocation → SDK sees `revoked` → reinstate
 *  - L1: AgentAuth sign/verify (proof-of-possession), wrong-key rejection
 *
 * Uses the deployer wallet (operator of the bonded test agent 0xe164…).
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import {
  AGENT_REVOCATION_CELO,
  buildAgentAuth,
  liveRevocationLookup,
  signAgentAuth,
  verifyAgentAuth,
  verifyAgentIdLive,
  credentialFromWire,
} from "@goodagent/agent-id";

const PK = process.env.PRIVATE_KEY as `0x${string}`;
if (!PK) throw new Error("PRIVATE_KEY missing");
const operator = privateKeyToAccount(PK);
const AGENT = "0xe1643a041D98228ddEB388353889BFc13d9a84C1" as const;
const API = process.env.API_BASE ?? "https://gcopilot-api.geinz.lol";

const pub = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
const wallet = createWalletClient({ account: operator, chain: celo, transport: http("https://forno.celo.org") });

const revAbi = [
  { type: "function", name: "revoke", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }], outputs: [] },
  { type: "function", name: "reinstate", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }], outputs: [] },
  { type: "function", name: "isRevoked", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

function step(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// Fetch the stored credential wire from the API's verify + list (we rebuild it
// from the DB via a direct verify of the stored agent).
async function fetchVerify(agent: string) {
  const r = await fetch(`${API}/agent/verify/${agent}`);
  return (await r.json()) as Record<string, unknown>;
}

// --- L1: AgentAuth primitives (offline) -------------------------------------
{
  const auth = buildAgentAuth({ agent: operator.address, audience: "live-test" });
  const wire = await signAgentAuth(operator, auth);
  const good = await verifyAgentAuth(wire, {
    expectedAgent: operator.address,
    expectedAudience: "live-test",
  });
  step("L1 agent auth verifies for the real key", good.valid === true);

  const attacker = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  );
  const forged = await signAgentAuth(attacker, {
    ...buildAgentAuth({ agent: attacker.address, audience: "live-test" }),
  });
  const bad = await verifyAgentAuth(
    { ...forged, agent: operator.address },
    { expectedAgent: operator.address, expectedAudience: "live-test" },
  );
  step(
    "L1 impersonator (wrong key) is rejected",
    bad.valid === false,
    String(bad.reason),
  );

  const stale = await signAgentAuth(
    operator,
    buildAgentAuth({ agent: operator.address, issuedAt: 1000n }),
  );
  const staleRes = await verifyAgentAuth(stale, { expectedAgent: operator.address });
  step("L1 stale auth is rejected", staleRes.valid === false, String(staleRes.reason));
}

// --- L1: production /agent/verify-auth --------------------------------------
{
  // No credential is stored for the operator address itself → authenticated
  // should pass (signature is genuinely ours) but valid must be false.
  const wire = await signAgentAuth(
    operator,
    buildAgentAuth({ agent: operator.address, audience: "live-test" }),
  );
  const res = await fetch(`${API}/agent/verify-auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth: wire, audience: "live-test" }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  step(
    "L1 /agent/verify-auth authenticates a real signature (no credential → not_found)",
    body.authenticated === true && body.valid === false,
    `status=${res.status} reason=${String(body.reason)}`,
  );

  const forgedRes = await fetch(`${API}/agent/verify-auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      auth: { ...wire, agent: AGENT },
      audience: "live-test",
    }),
  });
  const forgedBody = (await forgedRes.json()) as Record<string, unknown>;
  step(
    "L1 /agent/verify-auth rejects an impersonated agent address",
    forgedRes.status === 401 && forgedBody.authenticated === false,
    String(forgedBody.reason),
  );
}

// --- L2/L3: live verify of the bonded agent (pre-revocation) ----------------
{
  const v = await fetchVerify(AGENT);
  step(
    "L3 verify reports bondChecked + revocationChecked",
    v.bondChecked === true && v.revocationChecked === true,
    `valid=${String(v.valid)} reason=${String(v.reason ?? "-")}`,
  );
}

// --- L2: real on-chain revoke → observe → reinstate --------------------------
{
  const isRevoked = await pub.readContract({
    address: AGENT_REVOCATION_CELO,
    abi: revAbi,
    functionName: "isRevoked",
    args: [AGENT],
  });
  console.log(`   (pre-state: isRevoked=${isRevoked})`);

  if (!isRevoked) {
    const tx = await wallet.writeContract({
      address: AGENT_REVOCATION_CELO,
      abi: revAbi,
      functionName: "revoke",
      args: [AGENT],
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`   revoke tx: ${tx}`);
  }

  const seen = await liveRevocationLookup(AGENT);
  step("L2 SDK revocation lookup sees the on-chain revoke", seen === true);

  // API verify must now fail with `revoked` (cache is only 15s; wait it out).
  await new Promise((s) => setTimeout(s, 16_000));
  const v = await fetchVerify(AGENT);
  step(
    "L2 API verify returns revoked after on-chain revoke",
    v.valid === false && v.reason === "revoked",
    `reason=${String(v.reason)}`,
  );

  // Reinstate to leave the test agent usable.
  const tx2 = await wallet.writeContract({
    address: AGENT_REVOCATION_CELO,
    abi: revAbi,
    functionName: "reinstate",
    args: [AGENT],
  });
  await pub.waitForTransactionReceipt({ hash: tx2 });
  console.log(`   reinstate tx: ${tx2}`);
  const cleared = await liveRevocationLookup(AGENT);
  step("L2 reinstate clears the on-chain flag", cleared === false);

  await new Promise((s) => setTimeout(s, 16_000));
  const v2 = await fetchVerify(AGENT);
  step(
    "L2 API verify no longer reports revoked after reinstate",
    v2.reason !== "revoked",
    `valid=${String(v2.valid)} reason=${String(v2.reason ?? "-")}`,
  );
}

console.log("\ndone.");
