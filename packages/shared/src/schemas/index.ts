import { z } from "zod";

export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ---------------------------------------------------------------------------
// GoodDollar Agent ID — credential issue/verify (wire form: bigints as strings)
// ---------------------------------------------------------------------------

/** A non-negative integer encoded as a decimal string (for uint256/uint64). */
export const numericStringSchema = z
  .string()
  .regex(/^\d+$/, "Must be a non-negative integer string");

/** 0x-prefixed 65-byte ECDSA signature (r||s||v = 130 hex chars). */
export const hexSignatureSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{130}$/, "Invalid 65-byte signature");

/** The EIP-712 `AgentID` fields in JSON-safe wire form (identity-only). */
export const agentIdFieldsSchema = z.object({
  agent: addressSchema,
  operator: addressSchema,
  humanRoot: addressSchema,
  nonce: numericStringSchema,
  issuedAt: numericStringSchema,
  expiresAt: numericStringSchema,
});
export type AgentIdFieldsInput = z.infer<typeof agentIdFieldsSchema>;

/** A signed Agent ID credential as sent to / stored by the API. */
export const agentIdCredentialSchema = z.object({
  fields: agentIdFieldsSchema,
  signature: hexSignatureSchema,
  chainId: z.number().int().positive(),
  verifyingContract: addressSchema,
});
export type AgentIdCredentialInput = z.infer<typeof agentIdCredentialSchema>;

/** POST /agent/issue — submit a signed credential to be verified + stored. */
export const issueAgentRequestSchema = agentIdCredentialSchema;
export type IssueAgentRequest = z.infer<typeof issueAgentRequestSchema>;
