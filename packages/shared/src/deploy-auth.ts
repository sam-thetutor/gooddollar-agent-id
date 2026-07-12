export type DeployControlAction =
  | "pause"
  | "resume"
  | "baseline"
  | "run-pipeline";

export interface DeployControlAuth {
  ownerWallet: string;
  signature: `0x${string}`;
  issuedAt: number;
}

/** Signatures older than this are rejected (replay window). */
export const DEPLOY_CONTROL_MAX_AGE_MS = 5 * 60 * 1000;

/** Allow small client clock skew. */
export const DEPLOY_CONTROL_MAX_FUTURE_MS = 60 * 1000;

export function buildDeployControlMessage(
  action: DeployControlAction,
  deployId: string,
  issuedAt: number,
): string {
  return [
    "GoodAgent deploy control",
    `Action: ${action}`,
    `Deploy: ${deployId}`,
    `Issued: ${issuedAt}`,
  ].join("\n");
}

export function parseDeployControlAuth(
  body: Record<string, unknown>,
): DeployControlAuth | null {
  const ownerWallet =
    typeof body.ownerWallet === "string" ? body.ownerWallet.trim() : "";
  const signature =
    typeof body.signature === "string" ? body.signature.trim() : "";
  const issuedAt =
    typeof body.issuedAt === "number"
      ? body.issuedAt
      : typeof body.issuedAt === "string"
        ? Number(body.issuedAt)
        : NaN;

  if (!ownerWallet || !signature || !Number.isFinite(issuedAt)) {
    return null;
  }

  return {
    ownerWallet,
    signature: signature as `0x${string}`,
    issuedAt,
  };
}
