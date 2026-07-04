// ERC-8004 ("Trustless Agents") interop layer.
//
// ERC-8004 gives agents a portable on-chain identity (an ERC-721 in the
// Identity Registry) that resolves to an off-chain *registration file* (the
// "agent card"). That file advertises services and the trust models the agent
// supports. GoodDollar Agent ID plugs into this as a **crypto-economic +
// human** trust signal: we embed our EIP-712 Proof-of-Human credential inside
// the registration file (and, optionally, as on-chain `setMetadata`), so any
// ERC-8004-aware consumer can discover *and* verify that an agent is backed by
// a real, currently-verified GoodDollar human.
//
// Spec: https://eips.ethereum.org/EIPS/eip-8004

import { hexToString, toHex, type Hex } from "viem";
import { CELO_CHAIN_ID } from "./eip712.js";
import {
  credentialFromWire,
  type AgentIdCredentialWire,
} from "./serialize.js";
import { verifyAgentId, type VerifyOptions } from "./verify.js";
import { GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO } from "./humanProof.js";
import type { VerifyResult } from "./types.js";

/** ERC-8004 registration file schema identifier. */
export const ERC8004_REGISTRATION_TYPE =
  "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

/**
 * Namespaced key under which we embed the GoodDollar proof — both as a field in
 * the registration file and as an on-chain `setMetadata` key.
 */
export const GOODDOLLAR_PROOF_KEY = "gooddollar-proof-of-human";

/** Version tag for our embedded proof envelope. */
export const GOODDOLLAR_PROOF_VERSION = "gooddollar-agent-id/v1";

/** ERC-8004 Identity Registry (CREATE2 singleton) on Celo mainnet. */
export const ERC8004_IDENTITY_REGISTRY_CELO =
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

export interface Erc8004Service {
  name: string;
  endpoint: string;
  version?: string;
  [key: string]: unknown;
}

export interface Erc8004RegistrationRef {
  agentId: number;
  /** CAIP-style `{namespace}:{chainId}:{identityRegistry}`. */
  agentRegistry: string;
}

/** Our embedded Proof-of-Human envelope. */
export interface GoodDollarProof {
  type: typeof GOODDOLLAR_PROOF_VERSION;
  /** The signed Agent ID credential (JSON-safe wire form). */
  credential: AgentIdCredentialWire;
  /** GoodDollar Identity contract the human root was read from (informational). */
  identitySource?: string;
  /**
   * Deployed ERC-8004 `IHumanProofProvider` that can attest this human on-chain,
   * letting an `IERC8004ProofOfHuman` registry accept GoodDollar as a provider.
   */
  humanProofProvider?: string;
}

/** Minimal ERC-8004 registration file with our GoodDollar extension. */
export interface Erc8004Registration {
  type: string;
  name: string;
  description?: string;
  image?: string;
  services: Erc8004Service[];
  active: boolean;
  registrations?: Erc8004RegistrationRef[];
  supportedTrust: string[];
  /** GoodDollar Proof-of-Human extension. */
  [GOODDOLLAR_PROOF_KEY]?: GoodDollarProof;
  [key: string]: unknown;
}

/** Build the CAIP agentRegistry string for an ERC-8004 deployment. */
export function caip10AgentRegistry(
  chainId: number,
  identityRegistry: string,
): string {
  return `eip155:${chainId}:${identityRegistry}`;
}

export interface BuildRegistrationInput {
  /** The signed GoodDollar Agent ID credential (wire form). */
  credential: AgentIdCredentialWire;
  name: string;
  description?: string;
  image?: string;
  services?: Erc8004Service[];
  /** If the agent already minted an ERC-8004 NFT, bind it here. */
  agentId?: number;
  /** Identity Registry address; defaults to the Celo singleton. */
  identityRegistry?: string;
  chainId?: number;
  /** Extra trust models to advertise beyond the GoodDollar defaults. */
  extraTrust?: string[];
  /** GoodDollar Identity contract used for the human-root read. */
  identitySource?: string;
  /** Override the on-chain `IHumanProofProvider` address (defaults to Celo mainnet). */
  humanProofProvider?: string;
}

/**
 * Build an ERC-8004 registration file that embeds a GoodDollar Proof-of-Human.
 * The result can be hosted (https/ipfs), turned into a `data:` URI for fully
 * on-chain metadata, or written via `setMetadata(GOODDOLLAR_PROOF_KEY, …)`.
 */
export function buildErc8004Registration(
  input: BuildRegistrationInput,
): Erc8004Registration {
  const chainId = input.chainId ?? CELO_CHAIN_ID;
  const registry = input.identityRegistry ?? ERC8004_IDENTITY_REGISTRY_CELO;

  // GoodDollar adds two trust dimensions: a human is behind the agent
  // (verifiable via the embedded credential) and that human posted G$ stake.
  const trust = new Set<string>(["crypto-economic", ...(input.extraTrust ?? [])]);

  const registration: Erc8004Registration = {
    type: ERC8004_REGISTRATION_TYPE,
    name: input.name,
    description: input.description,
    image: input.image,
    services: input.services ?? [],
    active: true,
    supportedTrust: [...trust],
    [GOODDOLLAR_PROOF_KEY]: {
      type: GOODDOLLAR_PROOF_VERSION,
      credential: input.credential,
      identitySource: input.identitySource,
      humanProofProvider:
        input.humanProofProvider ?? GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO,
    },
  };

  if (input.agentId !== undefined) {
    registration.registrations = [
      { agentId: input.agentId, agentRegistry: caip10AgentRegistry(chainId, registry) },
    ];
  }

  return registration;
}

/** Extract the embedded GoodDollar proof from a registration file, if any. */
export function extractGoodDollarProof(
  registration: Erc8004Registration | Record<string, unknown>,
): GoodDollarProof | null {
  const proof = (registration as Record<string, unknown>)[GOODDOLLAR_PROOF_KEY];
  if (
    proof &&
    typeof proof === "object" &&
    "credential" in (proof as Record<string, unknown>)
  ) {
    return proof as GoodDollarProof;
  }
  return null;
}

export interface Erc8004VerifyResult extends VerifyResult {
  /** The agent address the credential vouches for (when present). */
  agent?: string;
}

/**
 * Verify an ERC-8004 registration file's GoodDollar Proof-of-Human. Extracts
 * the embedded credential and runs the full {@link verifyAgentId} check (live
 * human-root lookup included).
 */
export async function verifyErc8004Registration(
  registration: Erc8004Registration | Record<string, unknown>,
  opts: VerifyOptions,
): Promise<Erc8004VerifyResult> {
  const proof = extractGoodDollarProof(registration);
  if (!proof) {
    return {
      valid: false,
      reason: "no_gooddollar_proof",
      bondChecked: false,
      revocationChecked: false,
    };
  }
  let credential;
  try {
    credential = credentialFromWire(proof.credential);
  } catch {
    return {
      valid: false,
      reason: "bad_credential",
      bondChecked: false,
      revocationChecked: false,
    };
  }
  const result = await verifyAgentId(credential, opts);
  return { ...result, agent: credential.fields.agent };
}

// --- on-chain metadata / agentURI helpers ---------------------------------

/** Encode any JSON value as `bytes` for the registry's `setMetadata`. */
export function encodeMetadataValue(value: unknown): Hex {
  return toHex(JSON.stringify(value));
}

/** Decode `bytes` from `getMetadata` back into a JSON value. */
export function decodeMetadataValue<T = unknown>(data: Hex): T {
  return JSON.parse(hexToString(data)) as T;
}

/** Turn a registration file into a base64 `data:` URI for a fully on-chain agentURI. */
export function toDataUri(registration: Erc8004Registration): string {
  const json = JSON.stringify(registration);
  const b64 =
    typeof btoa === "function"
      ? btoa(json)
      : Buffer.from(json, "utf8").toString("base64");
  return `data:application/json;base64,${b64}`;
}

/** Parse a registration file from an https/ipfs/data agentURI's resolved JSON or a data URI. */
export function fromDataUri(uri: string): Erc8004Registration {
  const marker = "base64,";
  const idx = uri.indexOf(marker);
  const b64 = idx >= 0 ? uri.slice(idx + marker.length) : uri;
  const json =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("utf8");
  return JSON.parse(json) as Erc8004Registration;
}
