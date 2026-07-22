export type DeployControlAction =
  | "pause"
  | "resume"
  | "baseline"
  | "configuration"
  | "run-pipeline"
  | "confirm-vouch";

export interface DeployControlAuth {
  ownerWallet: string;
  signature: `0x${string}`;
  issuedAt: number;
}

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
