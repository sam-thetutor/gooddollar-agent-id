import {
  buildDeployControlMessage,
  type DeployControlAction,
  type DeployControlAuth,
} from "@goodagent/shared";

export type { DeployControlAction, DeployControlAuth };

export async function signDeployControl(
  action: DeployControlAction,
  deployId: string,
  ownerWallet: `0x${string}`,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
): Promise<DeployControlAuth> {
  const issuedAt = Date.now();
  const message = buildDeployControlMessage(action, deployId, issuedAt);
  const signature = await signMessageAsync({ message });
  return { ownerWallet, signature, issuedAt };
}

export function isDeployOwner(
  connected: string | undefined,
  ownerWallet: string | null | undefined,
): boolean {
  if (!connected || !ownerWallet) return false;
  return connected.toLowerCase() === ownerWallet.toLowerCase();
}
