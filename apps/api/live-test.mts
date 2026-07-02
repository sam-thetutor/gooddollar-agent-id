/**
 * Live smoke test for the deployed Agent ID API using REAL EIP-712 signatures
 * from the throwaway deployer wallet (not GoodDollar-verified, owns no bonds).
 * Every rejection below is therefore the expected, correct outcome.
 *
 * Run: npx tsx scripts/live-test.mts
 */
import { privateKeyToAccount } from "viem/accounts";

const API = process.env.API_URL ?? "https://gcopilot-api.geinz.lol";
const PK = process.env.PRIVATE_KEY as `0x${string}`;
if (!PK) throw new Error("PRIVATE_KEY not set");
const account = privateKeyToAccount(PK);
console.log("signer:", account.address);

const domain = {
  name: "GoodDollar Agent ID",
  version: "1",
  chainId: 42220,
  verifyingContract: "0x0000000000000000000000000000000000000000",
} as const;

const agentIdTypes = {
  AgentID: [
    { name: "agent", type: "address" },
    { name: "operator", type: "address" },
    { name: "humanRoot", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

const revokeTypes = {
  RevokeAgentID: [
    { name: "agent", type: "address" },
    { name: "operator", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

async function post(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// --- Test 1: issue a REALLY-signed credential from an unverified wallet -----
{
  const now = BigInt(Math.floor(Date.now() / 1000));
  const fields = {
    agent: "0x1111111111111111111111111111111111111111",
    operator: account.address,
    humanRoot: account.address,
    nonce: now,
    issuedAt: now,
    expiresAt: now + 180n * 24n * 3600n,
  } as const;
  const signature = await account.signTypedData({
    domain,
    types: agentIdTypes,
    primaryType: "AgentID",
    message: fields,
  });
  const wire = {
    fields: {
      agent: fields.agent,
      operator: fields.operator,
      humanRoot: fields.humanRoot,
      nonce: fields.nonce.toString(),
      issuedAt: fields.issuedAt.toString(),
      expiresAt: fields.expiresAt.toString(),
    },
    signature,
    chainId: 42220,
    verifyingContract: domain.verifyingContract,
  };
  const r = await post("/agent/issue", wire);
  console.log("\n[1] issue from NON-verified wallet (real sig)");
  console.log("    status:", r.status, JSON.stringify(r.body));
}

// --- Test 2: revoke someone ELSE's agent with a real signature ---------------
{
  const agent = "0x5Eecd4d9CFF6a33a9109E6dA1a09e50Da1f20d71"; // operator is 0x85A4...
  const msg = { agent, operator: account.address, nonce: 1n } as const;
  const signature = await account.signTypedData({
    domain,
    types: revokeTypes,
    primaryType: "RevokeAgentID",
    message: msg,
  });
  const r = await post("/agent/revoke", {
    agent,
    operator: account.address,
    nonce: "1",
    signature,
  });
  console.log("\n[2] revoke someone else's agent (real sig, wrong operator)");
  console.log("    status:", r.status, JSON.stringify(r.body));
}

// --- Test 3: revoke with operator SPOOFED (sig doesn't match claimed op) ----
{
  const agent = "0x5Eecd4d9CFF6a33a9109E6dA1a09e50Da1f20d71";
  const realOperator = "0x85A4b09fb0788f1C549a68dC2EdAe3F97aeb5Dd7";
  // We sign with the deployer but CLAIM to be the real operator.
  const signature = await account.signTypedData({
    domain,
    types: revokeTypes,
    primaryType: "RevokeAgentID",
    message: { agent, operator: realOperator, nonce: 1n },
  });
  const r = await post("/agent/revoke", {
    agent,
    operator: realOperator,
    nonce: "1",
    signature,
  });
  console.log("\n[3] revoke claiming the REAL operator, signed by attacker");
  console.log("    status:", r.status, JSON.stringify(r.body));
}

// --- Test 4: tampered signature ----------------------------------------------
{
  const agent = "0x5Eecd4d9CFF6a33a9109E6dA1a09e50Da1f20d71";
  const r = await post("/agent/revoke", {
    agent,
    operator: account.address,
    nonce: "1",
    signature: `0x${"ab".repeat(65)}`,
  });
  console.log("\n[4] revoke with garbage 65-byte signature");
  console.log("    status:", r.status, JSON.stringify(r.body));
}

// --- Test 5: short/malformed signature rejected by schema (L3 fix) ----------
{
  const r = await post("/agent/revoke", {
    agent: "0x5Eecd4d9CFF6a33a9109E6dA1a09e50Da1f20d71",
    operator: account.address,
    nonce: "1",
    signature: "0x1234",
  });
  console.log("\n[5] revoke with malformed short signature");
  console.log("    status:", r.status, JSON.stringify(r.body));
}
