import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress, type Address } from "viem";
import { buildAgentId, signAgentId } from "./sign.js";
import { buildAgentAuth, signAgentAuth, verifyAgentAuth } from "./agent-auth.js";
import { signAgentAttestation } from "./onchain.js";
import { attestationTypedData } from "./chain-lookup.js";
import { recoverTypedDataAddress, type Hex } from "viem";
import {
  verifyAgentId,
  type HumanRootLookup,
  type StakeLookup,
} from "./verify.js";
import { credentialFromWire, credentialToWire } from "./serialize.js";
import type { AgentIdCredential } from "./types.js";

// Deterministic test actors.
const operatorAccount = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const otherAccount = privateKeyToAccount(
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
);

const HUMAN_ROOT = getAddress(
  "0x1111111111111111111111111111111111111111",
);
const AGENT = getAddress("0x2222222222222222222222222222222222222222");

/** Lookup that always reports the operator verified with HUMAN_ROOT. */
const verifiedLookup: HumanRootLookup = () => HUMAN_ROOT;
/** Lookup that reports the operator not verified. */
const notVerifiedLookup: HumanRootLookup = () => null;
/** Lookup that reports a *different* root than the credential. */
const differentRootLookup: HumanRootLookup = () =>
  getAddress("0x3333333333333333333333333333333333333333");

async function issueCredential(
  overrides?: Partial<{ expiresAt: bigint; operator: Address }>,
): Promise<AgentIdCredential> {
  const fields = buildAgentId({
    agent: AGENT,
    operator: overrides?.operator ?? operatorAccount.address,
    humanRoot: HUMAN_ROOT,
    expiresAt: overrides?.expiresAt,
  });
  return signAgentId(operatorAccount, fields);
}

describe("Agent ID — issue & verify", () => {
  it("verifies a valid credential for a verified operator", async () => {
    const cred = await issueCredential();
    const result = await verifyAgentId(cred, {
      humanRootLookup: verifiedLookup,
    });
    expect(result.valid).toBe(true);
    expect(result.operator).toBe(operatorAccount.address);
    expect(result.humanRoot).toBe(HUMAN_ROOT);
  });

  it("rejects an expired credential", async () => {
    const cred = await issueCredential({ expiresAt: 1n });
    const result = await verifyAgentId(cred, {
      humanRootLookup: verifiedLookup,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("rejects when the operator is no longer verified", async () => {
    const cred = await issueCredential();
    const result = await verifyAgentId(cred, {
      humanRootLookup: notVerifiedLookup,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("operator_not_verified");
  });

  it("rejects when the live root differs from the credential root", async () => {
    const cred = await issueCredential();
    const result = await verifyAgentId(cred, {
      humanRootLookup: differentRootLookup,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("human_root_mismatch");
  });

  it("rejects when the signer is not the claimed operator", async () => {
    // Build fields claiming operatorAccount, but sign with otherAccount.
    const fields = buildAgentId({
      agent: AGENT,
      operator: operatorAccount.address,
      humanRoot: HUMAN_ROOT,
    });
    const cred = await signAgentId(otherAccount, fields);
    const result = await verifyAgentId(cred, {
      humanRootLookup: verifiedLookup,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects tampered fields", async () => {
    const cred = await issueCredential();
    const tampered: AgentIdCredential = {
      ...cred,
      fields: { ...cred.fields, nonce: cred.fields.nonce + 1n },
    };
    const result = await verifyAgentId(tampered, {
      humanRootLookup: verifiedLookup,
    });
    expect(result.valid).toBe(false);
    // Changing the message changes the recovered signer.
    expect(result.reason).toBe("signature_mismatch");
  });

  it("survives a wire round-trip and still verifies", async () => {
    const cred = await issueCredential();
    const roundTripped = credentialFromWire(credentialToWire(cred));
    expect(roundTripped.fields.humanRoot).toBe(cred.fields.humanRoot);
    expect(roundTripped.fields.expiresAt).toBe(cred.fields.expiresAt);
    const result = await verifyAgentId(roundTripped, {
      humanRootLookup: verifiedLookup,
    });
    expect(result.valid).toBe(true);
  });

  it("fails with insufficient_bond when the live stake is below the vault minimum", async () => {
    const cred = await issueCredential();
    const MIN = 250n * 10n ** 18n;
    const withdrawnLookup: StakeLookup = () => ({ stake: 0n, minStake: MIN });
    const result = await verifyAgentId(cred, {
      humanRootLookup: verifiedLookup,
      stakeLookup: withdrawnLookup,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("insufficient_bond");
    expect(result.stake).toBe(0n);
    expect(result.minStake).toBe(MIN);
  });

  it("stays valid while the live stake meets the vault minimum", async () => {
    const cred = await issueCredential();
    const MIN = 250n * 10n ** 18n;
    const bondedLookup: StakeLookup = () => ({ stake: MIN, minStake: MIN });
    const result = await verifyAgentId(cred, {
      humanRootLookup: verifiedLookup,
      stakeLookup: bondedLookup,
    });
    expect(result.valid).toBe(true);
    expect(result.stake).toBe(MIN);
  });

  it("honors an explicit `now` for time checks", async () => {
    const cred = await issueCredential({ expiresAt: 1000n });
    const before = await verifyAgentId(cred, {
      now: 500n,
      humanRootLookup: verifiedLookup,
    });
    expect(before.valid).toBe(true);
    const after = await verifyAgentId(cred, {
      now: 2000n,
      humanRootLookup: verifiedLookup,
    });
    expect(after.valid).toBe(false);
    expect(after.reason).toBe("expired");
  });

  it("marks bondChecked=false when no stakeLookup is supplied (no silent pass)", async () => {
    const cred = await issueCredential();
    const result = await verifyAgentId(cred, {
      humanRootLookup: verifiedLookup,
    });
    expect(result.valid).toBe(true);
    expect(result.bondChecked).toBe(false);
    expect(result.revocationChecked).toBe(false);
  });

  it("marks bondChecked=true when a stakeLookup runs", async () => {
    const cred = await issueCredential();
    const MIN = 250n * 10n ** 18n;
    const result = await verifyAgentId(cred, {
      humanRootLookup: verifiedLookup,
      stakeLookup: () => ({ stake: MIN, minStake: MIN }),
    });
    expect(result.bondChecked).toBe(true);
  });

  it("fails with `revoked` when the on-chain revocation lookup reports revoked", async () => {
    const cred = await issueCredential();
    const result = await verifyAgentId(cred, {
      humanRootLookup: verifiedLookup,
      revocationLookup: () => true,
      stakeLookup: () => ({ stake: 250n * 10n ** 18n, minStake: 250n * 10n ** 18n }),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("revoked");
    expect(result.revocationChecked).toBe(true);
  });

  it("stays valid when revocation lookup reports active", async () => {
    const cred = await issueCredential();
    const result = await verifyAgentId(cred, {
      humanRootLookup: verifiedLookup,
      revocationLookup: () => false,
    });
    expect(result.valid).toBe(true);
    expect(result.revocationChecked).toBe(true);
  });
});

describe("Agent auth — proof of possession", () => {
  it("verifies a fresh agent-signed auth", async () => {
    const now = 1_000_000n;
    const auth = buildAgentAuth({
      agent: operatorAccount.address,
      audience: "svc",
      issuedAt: now,
    });
    const wire = await signAgentAuth(operatorAccount, auth);
    const result = await verifyAgentAuth(wire, {
      expectedAgent: operatorAccount.address,
      expectedAudience: "svc",
      now,
    });
    expect(result.valid).toBe(true);
    expect(result.agent).toBe(operatorAccount.address);
  });

  it("rejects an auth signed by a different key (impersonation)", async () => {
    const now = 1_000_000n;
    // Attacker knows the agent address but not its key: they sign with their own.
    const auth = buildAgentAuth({ agent: operatorAccount.address, issuedAt: now });
    const wire = await signAgentAuth(otherAccount, {
      ...auth,
      agent: otherAccount.address,
    });
    const result = await verifyAgentAuth(wire, {
      expectedAgent: operatorAccount.address,
      now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("agent_auth_wrong_agent");
  });

  it("rejects a stale auth (freshness window)", async () => {
    const issuedAt = 1_000_000n;
    const auth = buildAgentAuth({ agent: operatorAccount.address, issuedAt });
    const wire = await signAgentAuth(operatorAccount, auth);
    const result = await verifyAgentAuth(wire, {
      expectedAgent: operatorAccount.address,
      now: issuedAt + 10_000n,
      maxAgeSeconds: 300n,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("agent_auth_expired");
  });

  it("rejects an audience mismatch", async () => {
    const now = 1_000_000n;
    const auth = buildAgentAuth({
      agent: operatorAccount.address,
      audience: "svc-a",
      issuedAt: now,
    });
    const wire = await signAgentAuth(operatorAccount, auth);
    const result = await verifyAgentAuth(wire, {
      expectedAgent: operatorAccount.address,
      expectedAudience: "svc-b",
      now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("agent_auth_audience_mismatch");
  });
});

describe("On-chain attestation — offline signing", () => {
  it("produces a relay-ready signature that recovers to the agent", async () => {
    const signed = await signAgentAttestation(operatorAccount, { nonce: 0n });
    expect(signed.agent).toBe(operatorAccount.address);
    expect(signed.deadline).toBeGreaterThan(
      BigInt(Math.floor(Date.now() / 1000)),
    );

    // Recover exactly what the contract recovers in attestFor().
    const typed = attestationTypedData({
      agent: signed.agent,
      nonce: 0n,
      deadline: signed.deadline,
    });
    const recovered = await recoverTypedDataAddress({
      ...typed,
      signature: signed.signature as Hex,
    });
    expect(recovered).toBe(operatorAccount.address);
  });

  it("a different key's signature does not recover to the agent", async () => {
    const signed = await signAgentAttestation(otherAccount, { nonce: 0n });
    const typed = attestationTypedData({
      agent: operatorAccount.address, // forged claim
      nonce: 0n,
      deadline: signed.deadline,
    });
    const recovered = await recoverTypedDataAddress({
      ...typed,
      signature: signed.signature as Hex,
    });
    expect(recovered).not.toBe(operatorAccount.address);
  });
});
