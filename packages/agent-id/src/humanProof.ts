// On-chain ERC-8004 Proof-of-Human provider helpers.
//
// `GoodDollarHumanProofProvider` (packages/contracts) is a standard ERC-8004
// `IHumanProofProvider`: any `IERC8004ProofOfHuman` registry can call its
// `verifyHumanProof(proof, data)` to accept a passport-free, GoodDollar-rooted
// human and obtain a deterministic per-human nullifier.
//
// To produce a valid proof, a GoodDollar-verified human signs an EIP-712
// `GoodDollarHumanProof(human, agent)` message (the `proof` arg) while `data`
// carries `(human, agent)`. These helpers build both, with digests that match
// the deployed provider's on-chain `proofDigest`.

import {
  encodeAbiParameters,
  hashTypedData,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";
import { CELO_CHAIN_ID } from "./eip712.js";

/** GoodDollarHumanProofProvider on Celo mainnet (packages/contracts). */
export const GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO =
  "0x80c4de6872049cb20989156bca50134c781f48c9" as const;

/** Provider name returned by the deployed contract. */
export const GOODDOLLAR_PROVIDER_NAME = "GoodDollar";

/** Verification strength (0-100) the deployed provider reports. */
export const GOODDOLLAR_VERIFICATION_STRENGTH = 75;

/** EIP-712 struct the human signs to authorize an agent. */
export const humanProofTypes = {
  GoodDollarHumanProof: [
    { name: "human", type: "address" },
    { name: "agent", type: "address" },
  ],
} as const;

export const HUMAN_PROOF_PRIMARY_TYPE = "GoodDollarHumanProof" as const;

export interface HumanProofDomainOptions {
  chainId?: number;
  /** Provider contract address (EIP-712 `verifyingContract`). */
  provider?: Address;
}

/** Build the EIP-712 domain bound to the provider contract. */
export function humanProofDomain(
  opts?: HumanProofDomainOptions,
): TypedDataDomain {
  return {
    name: "GoodDollar Agent ID",
    version: "1",
    chainId: opts?.chainId ?? CELO_CHAIN_ID,
    verifyingContract:
      opts?.provider ?? GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO,
  };
}

/** EIP-712 typed data a GoodDollar human signs to authorize `agent`. */
export function humanProofTypedData(
  human: Address,
  agent: Address,
  opts?: HumanProofDomainOptions,
) {
  return {
    domain: humanProofDomain(opts),
    types: humanProofTypes,
    primaryType: HUMAN_PROOF_PRIMARY_TYPE,
    message: { human, agent },
  } as const;
}

/** Digest to sign — matches the provider's on-chain `proofDigest(human, agent)`. */
export function humanProofDigest(
  human: Address,
  agent: Address,
  opts?: HumanProofDomainOptions,
): Hex {
  return hashTypedData(humanProofTypedData(human, agent, opts));
}

/**
 * ABI-encoded `data` argument for `verifyHumanProof` / `registerWithHumanProof`.
 * The human's 65-byte EIP-712 signature over {@link humanProofTypedData} is the
 * matching `proof` argument.
 */
export function encodeHumanProofData(human: Address, agent: Address): Hex {
  return encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [human, agent],
  );
}
