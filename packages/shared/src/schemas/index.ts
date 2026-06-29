import { z } from "zod";

export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

export const txHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash");

export const telegramIdSchema = z.string().min(1);

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const actionTypeSchema = z.enum(["claim", "transfer", "create_stream"]);
export type ActionTypeValue = z.infer<typeof actionTypeSchema>;

export const actionStatusSchema = z.enum([
  "pending",
  "completed",
  "expired",
  "failed",
]);
export type ActionStatusValue = z.infer<typeof actionStatusSchema>;

/** POST /sessions/link — link a wallet to a Telegram user. */
export const linkWalletSchema = z.object({
  telegramId: telegramIdSchema,
  wallet: addressSchema,
  /** Telegram WebApp initData string, validated server-side via HMAC. */
  initData: z.string().optional(),
  /**
   * Signed link token (alternative to initData) for contexts without a Telegram
   * WebApp context — e.g. MiniPay's in-app browser or a normal mobile browser.
   */
  token: z.string().optional(),
});
export type LinkWalletInput = z.infer<typeof linkWalletSchema>;

/** POST /actions — create a pending action to be signed in the Mini App. */
export const createActionSchema = z.object({
  telegramId: telegramIdSchema,
  actionType: actionTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  ttlMinutes: z.number().int().positive().max(60).optional(),
});
export type CreateActionInput = z.infer<typeof createActionSchema>;

/** POST /actions/:id/complete — mark an action complete with its tx hash. */
export const completeActionSchema = z.object({
  txHash: txHashSchema,
});
export type CompleteActionInput = z.infer<typeof completeActionSchema>;

/** A single chat message in a copilot conversation. */
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** POST /chat — talk to the GoodDollar copilot (LLM + MCP tools). */
export const chatRequestSchema = z.object({
  /** Full conversation so far; the last message should be from the user. */
  messages: z.array(chatMessageSchema).min(1).max(30),
  /** Connected wallet, used as default context for on-chain tool calls. */
  wallet: addressSchema.optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ---------------------------------------------------------------------------
// GoodDollar Agent ID — credential issue/verify (wire form: bigints as strings)
// ---------------------------------------------------------------------------

/** A non-negative integer encoded as a decimal string (for uint256/uint64). */
export const numericStringSchema = z
  .string()
  .regex(/^\d+$/, "Must be a non-negative integer string");

/** 0x-prefixed hex signature (any even length). */
export const hexSignatureSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]+$/, "Invalid hex signature");

/** Comma-separated capability scopes, e.g. "pay,trade,post". */
export const scopesSchema = z.string().min(1).max(200);

/** The EIP-712 `AgentID` fields in JSON-safe wire form. */
export const agentIdFieldsSchema = z.object({
  agent: addressSchema,
  operator: addressSchema,
  humanRoot: addressSchema,
  scopes: scopesSchema,
  stake: numericStringSchema,
  budgetCap: numericStringSchema,
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
