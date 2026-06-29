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
  scopes: string;
  stake: string;
  budgetCap: string;
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
  scopes?: string;
  stake?: string;
  budgetCap?: string;
  expiresAt?: string;
}

export function fieldsToWire(fields: AgentIdFields): AgentIdFieldsWire {
  return {
    agent: fields.agent,
    operator: fields.operator,
    humanRoot: fields.humanRoot,
    scopes: fields.scopes,
    stake: fields.stake.toString(),
    budgetCap: fields.budgetCap.toString(),
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
    scopes: wire.scopes,
    stake: BigInt(wire.stake),
    budgetCap: BigInt(wire.budgetCap),
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
    scopes: result.scopes,
    stake: result.stake?.toString(),
    budgetCap: result.budgetCap?.toString(),
    expiresAt: result.expiresAt?.toString(),
  };
}
