import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
import { buildAgentId, signAgentId } from "./sign.js";
import { credentialToWire } from "./serialize.js";
import { type HumanRootLookup } from "./verify.js";
import {
  ERC8004_IDENTITY_REGISTRY_CELO,
  ERC8004_REGISTRATION_TYPE,
  GOODDOLLAR_PROOF_KEY,
  buildErc8004Registration,
  caip10AgentRegistry,
  decodeMetadataValue,
  encodeMetadataValue,
  extractGoodDollarProof,
  fromDataUri,
  toDataUri,
  verifyErc8004Registration,
} from "./erc8004.js";

const operatorAccount = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const HUMAN_ROOT = getAddress("0x1111111111111111111111111111111111111111");
const AGENT = getAddress("0x2222222222222222222222222222222222222222");
const verifiedLookup: HumanRootLookup = () => HUMAN_ROOT;

async function wireCredential() {
  const fields = buildAgentId({
    agent: AGENT,
    operator: operatorAccount.address,
    humanRoot: HUMAN_ROOT,
  });
  return credentialToWire(await signAgentId(operatorAccount, fields));
}

describe("ERC-8004 interop", () => {
  it("builds a spec-shaped registration embedding the GoodDollar proof", async () => {
    const credential = await wireCredential();
    const reg = buildErc8004Registration({
      credential,
      name: "Test Agent",
      description: "demo",
      agentId: 42,
    });

    expect(reg.type).toBe(ERC8004_REGISTRATION_TYPE);
    expect(reg.active).toBe(true);
    expect(reg.supportedTrust).toContain("crypto-economic");
    expect(reg.registrations?.[0]).toEqual({
      agentId: 42,
      agentRegistry: caip10AgentRegistry(42220, ERC8004_IDENTITY_REGISTRY_CELO),
    });
    const proof = reg[GOODDOLLAR_PROOF_KEY];
    expect(proof?.credential.fields.agent).toBe(credential.fields.agent);
  });

  it("verifies the embedded proof via the live human-root check", async () => {
    const credential = await wireCredential();
    const reg = buildErc8004Registration({ credential, name: "A" });
    const result = await verifyErc8004Registration(reg, {
      humanRootLookup: verifiedLookup,
    });
    expect(result.valid).toBe(true);
    expect(result.agent).toBe(AGENT);
  });

  it("flags a registration with no GoodDollar proof", async () => {
    const result = await verifyErc8004Registration(
      { type: ERC8004_REGISTRATION_TYPE, name: "x", services: [], active: true, supportedTrust: [] },
      { humanRootLookup: verifiedLookup },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("no_gooddollar_proof");
  });

  it("extracts the proof and survives a data-URI round-trip", async () => {
    const credential = await wireCredential();
    const reg = buildErc8004Registration({ credential, name: "RoundTrip" });
    const uri = toDataUri(reg);
    expect(uri.startsWith("data:application/json;base64,")).toBe(true);
    const back = fromDataUri(uri);
    const proof = extractGoodDollarProof(back);
    expect(proof?.credential.signature).toBe(credential.signature);
  });

  it("encodes/decodes on-chain metadata bytes", async () => {
    const credential = await wireCredential();
    const proof = { type: "gooddollar-agent-id/v1", credential };
    const bytes = encodeMetadataValue(proof);
    expect(bytes.startsWith("0x")).toBe(true);
    const decoded = decodeMetadataValue<typeof proof>(bytes);
    expect(decoded.credential.fields.agent).toBe(credential.fields.agent);
  });
});
