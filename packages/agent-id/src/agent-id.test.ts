import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress, type Address } from "viem";
import { buildAgentId, signAgentId } from "./sign.js";
import { verifyAgentId, type HumanRootLookup } from "./verify.js";
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
});
