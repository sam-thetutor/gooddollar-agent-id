export type DeployControlAction =
  | "pause"
  | "resume"
  | "baseline"
  | "configuration"
  | "display-name"
  | "run-pipeline"
  | "confirm-vouch"
  | "play"
  | "credits-record"
  | "productclank-link"
  | "telegram-link";

export interface DeployControlAuth {
  ownerWallet: string;
  signature: `0x${string}`;
  issuedAt: number;
  /**
   * Optional single-use id. When present it is part of the signed message and
   * the verifier rejects any nonce it has already seen, closing the replay
   * window that freshness checks alone leave open.
   */
  nonce?: string;
}

const NONCE_RE = /^[A-Za-z0-9-]{8,64}$/;

/** Signatures older than this are rejected (replay window). */
export const DEPLOY_CONTROL_MAX_AGE_MS = 5 * 60 * 1000;

/** Allow small client clock skew. */
export const DEPLOY_CONTROL_MAX_FUTURE_MS = 60 * 1000;

export function buildDeployControlMessage(
  action: DeployControlAction,
  deployId: string,
  issuedAt: number,
  nonce?: string,
): string {
  const lines = [
    "GoodAgent deploy control",
    `Action: ${action}`,
    `Deploy: ${deployId}`,
    `Issued: ${issuedAt}`,
  ];
  if (nonce) lines.push(`Nonce: ${nonce}`);
  return lines.join("\n");
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

  const rawNonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
  if (rawNonce && !NONCE_RE.test(rawNonce)) return null;

  return {
    ownerWallet,
    signature: signature as `0x${string}`,
    issuedAt,
    ...(rawNonce ? { nonce: rawNonce } : {}),
  };
}
