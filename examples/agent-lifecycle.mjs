#!/usr/bin/env node
/**
 * GoodDollar Agent ID — the AGENT's side of the lifecycle (SDK-only).
 *
 * Registration is agent-first: an address can only be registered after its
 * key attests. This demo walks the agent's three jobs:
 *   1. ATTEST — prove you control your address (offline signature, relayable
 *      on-chain by anyone via attestFor; single-use, deadline-bound).
 *   2. CHECK  — read the live AgentAttestation registry on Celo.
 *   3. AUTH   — sign a fresh AgentAuth challenge so a counterparty can verify
 *      it's really you (credentials are public — never a bearer token).
 *
 * Run:  node agent-lifecycle.mjs
 * No gas or funds needed — everything on-chain here is read-only; the attest
 * signature is printed instead of relayed (hand it to any funded wallet).
 */
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  signAgentAttestation,
  isAgentAttested,
  liveAttestationLookup,
  buildAgentAuth,
  signAgentAuth,
  verifyAgentAuth,
  AGENT_ATTESTATION_CELO,
} from "@goodagent/agent-id";

const line = () => console.log("─".repeat(64));

// A throwaway agent key — in real life this is YOUR key.
const agent = privateKeyToAccount(generatePrivateKey());
console.log("Agent address:", agent.address);
console.log("Attestation registry (Celo):", AGENT_ATTESTATION_CELO);
line();

// 1. ATTEST — sign the AttestAgent message offline. -------------------------
// Anyone can relay this on-chain with relayAgentAttestation(wallet, signed)
// (or attestFor directly); the relayer only pays gas — your signature is the
// proof. If you hold CELO yourself, one call does it: attestAsAgent(wallet).
const signed = await signAgentAttestation(agent);
console.log("1) Signed relay-ready attestation (single-use, deadline-bound):");
console.log("   agent:   ", signed.agent);
console.log("   deadline:", signed.deadline.toString());
console.log("   sig:     ", signed.signature.slice(0, 28) + "…");
line();

// 2. CHECK — read the live registry. ----------------------------------------
// This fresh key has (of course) never attested; a registered agent's address
// returns true + the provenAt timestamp.
const attested = await isAgentAttested(agent.address);
const provenAt = await liveAttestationLookup(agent.address);
console.log("2) Live registry read:");
console.log("   isAgentAttested:", attested, "(fresh key — expected false)");
console.log("   provenAt:       ", provenAt.toString(), "(0 = never)");
line();

// 3. AUTH — prove to a counterparty that you're really this address. --------
const auth = buildAgentAuth({
  agent: agent.address,
  audience: "example-marketplace", // scoped: can't be replayed elsewhere
});
const wire = await signAgentAuth(agent, auth);

// Counterparty side (or POST /agent/verify-auth on the hosted API):
const result = await verifyAgentAuth(wire, {
  expectedAgent: agent.address,
  expectedAudience: "example-marketplace",
});
console.log("3) AgentAuth round-trip:");
console.log("   authenticated:", result.valid ? "✅ yes" : `❌ ${result.reason}`);

// And a forged one (different key claiming this agent) must fail:
const impostor = privateKeyToAccount(generatePrivateKey());
const forged = await signAgentAuth(
  impostor,
  buildAgentAuth({ agent: impostor.address, audience: "example-marketplace" }),
);
const rejected = await verifyAgentAuth(
  { ...forged, agent: agent.address },
  { expectedAgent: agent.address, expectedAudience: "example-marketplace" },
);
console.log("   forged auth rejected:", !rejected.valid ? `✅ (${rejected.reason})` : "❌ ACCEPTED?!");
line();

console.log("Done. Full flow for a real agent:");
console.log("  1. attest (above) → 2. human stakes 250 G$ + signs at /issue →");
console.log("  3. poll GET /agent/verify/<you> until found && valid →");
console.log("  4. answer AgentAuth challenges when counterparties ask.");
