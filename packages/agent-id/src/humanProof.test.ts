import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { decodeAbiParameters, getAddress, recoverAddress } from "viem";
import {
  GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO,
  GOODDOLLAR_VERIFICATION_STRENGTH,
  encodeHumanProofData,
  humanProofDigest,
  humanProofTypedData,
} from "./humanProof.js";

const HUMAN = getAddress("0x1111111111111111111111111111111111111111");
const AGENT = getAddress("0x2222222222222222222222222222222222222222");

describe("humanProof", () => {
  it("digest matches the deployed provider's on-chain proofDigest", () => {
    // Canonical value read from the live contract on Celo mainnet
    // (provider 0x80c4…48c9, chainId 42220).
    expect(humanProofDigest(HUMAN, AGENT)).toBe(
      "0xacf89fdc1e1b250299a23fbc469c4c2bf46e9d777de5c396c84e786c2bc764b1",
    );
  });

  it("exposes the deployed provider constants", () => {
    expect(GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO).toBe(
      "0x80c4de6872049cb20989156bca50134c781f48c9",
    );
    expect(GOODDOLLAR_VERIFICATION_STRENGTH).toBe(75);
  });

  it("encodeHumanProofData round-trips (human, agent)", () => {
    const data = encodeHumanProofData(HUMAN, AGENT);
    const [human, agent] = decodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      data,
    );
    expect(getAddress(human)).toBe(HUMAN);
    expect(getAddress(agent)).toBe(AGENT);
  });

  it("a human signature over the typed data recovers to the human", async () => {
    const account = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    const td = humanProofTypedData(account.address, AGENT);
    const signature = await account.signTypedData(td);
    const recovered = await recoverAddress({
      hash: humanProofDigest(account.address, AGENT),
      signature,
    });
    expect(getAddress(recovered)).toBe(getAddress(account.address));
  });
});
