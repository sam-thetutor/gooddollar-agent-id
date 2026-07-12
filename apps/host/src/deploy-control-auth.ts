import {
  buildDeployControlMessage,
  DEPLOY_CONTROL_MAX_AGE_MS,
  DEPLOY_CONTROL_MAX_FUTURE_MS,
  parseDeployControlAuth,
  type DeployControlAction,
  type DeployControlAuth,
} from "@goodagent/shared";
import { verifyMessage } from "viem";

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

  const message = buildDeployControlMessage(action, deployId, auth.issuedAt);
  const valid = await verifyMessage({
    address: claimed as `0x${string}`,
    message,
    signature: auth.signature,
  });
  if (!valid) return "INVALID_SIGNATURE";

  return null;
}

export type { DeployControlAuth };
