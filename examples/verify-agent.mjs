#!/usr/bin/env node
/**
 * GoodDollar Agent ID — end-to-end SDK example.
 *
 * Demonstrates the full third-party flow using ONLY the published SDK:
 *   1. An operator issues + EIP-712-signs an Agent ID credential.
 *   2. Anyone verifies it (signature + expiry + LIVE GoodDollar human-root read).
 *   3. The credential is wrapped as an ERC-8004 registration file and verified
 *      back out — interop with the Trustless Agents standard.
 *
 * Run:  node verify-agent.mjs
 * Optional: CHECK_OPERATOR=0x... to live-check any address's GoodDollar status.
 */
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  buildAgentId,
  signAgentId,
  verifyAgentId,
  credentialToWire,
  liveHumanRootLookup,
  buildErc8004Registration,
  verifyErc8004Registration,
  toDataUri,
  fromDataUri,
  extractGoodDollarProof,
} from "@goodagent/agent-id";

const line = () => console.log("─".repeat(64));

// 1. Operator issues + signs a credential ----------------------------------
const operator = privateKeyToAccount(generatePrivateKey());
const agent = "0x2222222222222222222222222222222222222222";
// In production this is the operator's real GoodDollar root (getWhitelistedRoot).
const humanRoot = "0x1111111111111111111111111111111111111111";

const fields = buildAgentId({
  agent,
  operator: operator.address,
  humanRoot,
  ttlDays: 30,
});
const credential = await signAgentId(operator, fields);

console.log("1) Issued & signed Agent ID credential");
console.log("   operator:", operator.address);
console.log("   agent:   ", agent);
line();

// 2a. Verify with the credential's claimed root (mock lookup = happy path) ---
const mockLookup = () => humanRoot;
const okResult = await verifyAgentId(credential, { humanRootLookup: mockLookup });
console.log("2a) Verify (operator treated as verified):", okResult.valid ? "✅ valid" : `❌ ${okResult.reason}`);

// 2b. Verify against the LIVE GoodDollar Identity contract on Celo -----------
// The throwaway operator key is NOT GoodDollar-verified, so this correctly
// returns operator_not_verified — proving the live, on-chain check is real.
const liveResult = await verifyAgentId(credential, {
  humanRootLookup: liveHumanRootLookup,
});
console.log(
  "2b) Verify (LIVE Celo human-root read):",
  liveResult.valid ? "✅ valid" : `❌ ${liveResult.reason} (expected for a random key)`,
);
line();

// 3. ERC-8004 interop: wrap as a registration file and verify it back --------
const registration = buildErc8004Registration({
  credential: credentialToWire(credential),
  name: "Example Agent",
  description: "Demo agent backed by a GoodDollar human",
  agentId: 42,
});
const agentURI = toDataUri(registration);
console.log("3) Built ERC-8004 registration file");
console.log("   supportedTrust:", registration.supportedTrust.join(", "));
console.log("   agentURI (data:):", agentURI.slice(0, 56) + "…");

const parsed = fromDataUri(agentURI);
const proof = extractGoodDollarProof(parsed);
console.log("   embedded proof for agent:", proof?.credential.fields.agent);

const ercResult = await verifyErc8004Registration(parsed, {
  humanRootLookup: mockLookup,
});
console.log("   verify embedded proof:", ercResult.valid ? "✅ valid" : `❌ ${ercResult.reason}`);
line();

// 4. (Optional) live-check any address's GoodDollar verification status ------
const toCheck = process.env.CHECK_OPERATOR;
if (toCheck) {
  const root = await liveHumanRootLookup(toCheck);
  console.log(
    `4) Live GoodDollar status for ${toCheck}:`,
    root ? `✅ verified (root ${root})` : "❌ not verified",
  );
} else {
  console.log("4) Set CHECK_OPERATOR=0x... to live-check a real address's GoodDollar status.");
}

console.log("\nDone. The SDK verified a credential, ran a LIVE on-chain human-root");
console.log("check, and round-tripped through the ERC-8004 standard.");
