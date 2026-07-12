import type { DeployAgent, DeployStatusResponse } from "./host.js";

export function issueAgentHref(agentAddress: string, deployId?: string): string {
  const params = new URLSearchParams({ agent: agentAddress });
  if (deployId) params.set("deploy", deployId);
  return `/issue?${params}`;
}

/** Hosted deploy is ready but the operator has not issued an Agent ID yet. */
export function deployNeedsUserVouch(
  status: DeployStatusResponse | null | undefined,
): boolean {
  if (!status?.agentAddress) return false;
  if (status.pipelineRunning) return false;
  if (status.status === "failed" || status.status === "running") return false;
  if (status.verify?.valid === true) return false;
  return status.status === "awaiting_vouch" || status.status === "starting";
}

export function deployAgentNeedsVouch(agent: DeployAgent): boolean {
  return agent.status === "awaiting_vouch" && Boolean(agent.agentAddress);
}
