import {
  buildDeployControlMessage,
  DEPLOY_CONTROL_MAX_AGE_MS,
  DEPLOY_CONTROL_MAX_FUTURE_MS,
  parseDeployControlAuth,
  type DeployControlAction,
  type DeployControlAuth,
} from "@goodagent/shared";
import { verifyMessage } from "viem";

/**
 * Nonces already accepted, kept for the freshness window. In-memory is enough:
 * the host is a single process, and a restart only re-opens the same ≤6-minute
 * window the timestamp checks already bound.
 */
const seenNonces = new Map<string, number>();

function burnNonce(deployId: string, nonce: string, now: number): boolean {
  if (seenNonces.size > 10_000 || Math.random() < 0.01) {
    for (const [key, expiry] of seenNonces) {
      if (expiry <= now) seenNonces.delete(key);
    }
  }
  const key = `${deployId}:${nonce}`;
  if ((seenNonces.get(key) ?? 0) > now) return false;
  seenNonces.set(
    key,
    now + DEPLOY_CONTROL_MAX_AGE_MS + DEPLOY_CONTROL_MAX_FUTURE_MS,
  );
  return true;
}

export async function verifyDeployControl(
  action: DeployControlAction,
  deployId: string,
  recordedOwner: string | null | undefined,
  body: Record<string, unknown>,
): Promise<string | null> {
  const auth = parseDeployControlAuth(body);
  if (!auth) return "OWNER_AUTH_REQUIRED";

  if (!recordedOwner) return "OWNER_NOT_SET";

  const expected = recordedOwner.toLowerCase();
  const claimed = auth.ownerWallet.toLowerCase();
  if (claimed !== expected) return "OWNER_MISMATCH";

  const now = Date.now();
  if (auth.issuedAt > now + DEPLOY_CONTROL_MAX_FUTURE_MS) {
    return "SIGNATURE_FUTURE";
  }
  if (now - auth.issuedAt > DEPLOY_CONTROL_MAX_AGE_MS) {
    return "SIGNATURE_EXPIRED";
  }

  const message = buildDeployControlMessage(
    action,
    deployId,
    auth.issuedAt,
    auth.nonce,
  );
  const valid = await verifyMessage({
    address: claimed as `0x${string}`,
    message,
    signature: auth.signature,
  });
  if (!valid) return "INVALID_SIGNATURE";

  // Burn after the signature check so strangers can't exhaust others' nonces.
  if (auth.nonce && !burnNonce(deployId, auth.nonce, now)) {
    return "NONCE_REUSED";
  }

  return null;
}

export type { DeployControlAuth };
