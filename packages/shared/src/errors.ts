export class AgentIdError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AgentIdError";
  }
}

export const ErrorCodes = {
  NOT_VERIFIED: "NOT_VERIFIED",
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  SESSION_MISMATCH: "SESSION_MISMATCH",
  ACTION_EXPIRED: "ACTION_EXPIRED",
  INVALID_ADDRESS: "INVALID_ADDRESS",
  RPC_ERROR: "RPC_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
