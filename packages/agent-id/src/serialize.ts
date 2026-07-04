import { getAddress, type Address } from "viem";
import type { AgentIdCredential, AgentIdFields, VerifyResult } from "./types.js";

/**
 * JSON-safe ("wire") form of {@link AgentIdFields} — bigints become decimal
 * strings so credentials can travel over HTTP / be stored in a text column.
 */
export interface AgentIdFieldsWire {
  agent: string;
  operator: string;
  humanRoot: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export interface AgentIdCredentialWire {
  fields: AgentIdFieldsWire;
  signature: string;
  chainId: number;
  verifyingContract: string;
}

/** JSON-safe form of {@link VerifyResult}. */
export interface VerifyResultWire {
  valid: boolean;
  reason?: string;
  operator?: string;
  humanRoot?: string;
  expiresAt?: string;
  stake?: string;
  minStake?: string;
  bondChecked: boolean;
  revocationChecked: boolean;
  agentProven?: boolean;
  agentProvenAt?: string;
}

export function fieldsToWire(fields: AgentIdFields): AgentIdFieldsWire {
  return {
    agent: fields.agent,
    operator: fields.operator,
    humanRoot: fields.humanRoot,
    nonce: fields.nonce.toString(),
    issuedAt: fields.issuedAt.toString(),
    expiresAt: fields.expiresAt.toString(),
  };
}

export function fieldsFromWire(wire: AgentIdFieldsWire): AgentIdFields {
  return {
    agent: getAddress(wire.agent),
    operator: getAddress(wire.operator),
    humanRoot: getAddress(wire.humanRoot),
    nonce: BigInt(wire.nonce),
    issuedAt: BigInt(wire.issuedAt),
    expiresAt: BigInt(wire.expiresAt),
  };
}

export function credentialToWire(
  credential: AgentIdCredential,
): AgentIdCredentialWire {
  return {
    fields: fieldsToWire(credential.fields),
    signature: credential.signature,
    chainId: credential.chainId,
    verifyingContract: credential.verifyingContract,
  };
}

export function credentialFromWire(
  wire: AgentIdCredentialWire,
): AgentIdCredential {
  return {
    fields: fieldsFromWire(wire.fields),
    signature: wire.signature as `0x${string}`,
    chainId: wire.chainId,
    verifyingContract: getAddress(wire.verifyingContract) as Address,
  };
}

export function verifyResultToWire(result: VerifyResult): VerifyResultWire {
  return {
    valid: result.valid,
    reason: result.reason,
    operator: result.operator,
    humanRoot: result.humanRoot,
    expiresAt: result.expiresAt?.toString(),
    stake: result.stake?.toString(),
    minStake: result.minStake?.toString(),
    bondChecked: result.bondChecked,
    revocationChecked: result.revocationChecked,
    agentProven: result.agentProven,
    agentProvenAt: result.agentProvenAt?.toString(),
  };
}
