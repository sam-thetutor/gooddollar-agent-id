import type { DeployStatusResponse } from "../client/host.js";

export type DeployProgressStep = {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
};

export function isDeployProvisioning(
  status: DeployStatusResponse | null | undefined,
  deployId?: string,
): boolean {
  if (!deployId) return false;
  if (!status) return true;
  if (status.pipelineRunning) return true;
  return (
    status.status === "provisioning" ||
    status.status === "installing" ||
    status.status === "starting"
  );
}

export function deployProgressSteps(
  status: DeployStatusResponse | null | undefined,
  deployId?: string,
): DeployProgressStep[] {
  const step = status?.status;
  const hasId = Boolean(deployId);
  const hasAddress = Boolean(status?.agentAddress);
  const pipeline = status?.pipelineRunning ?? false;
  const awaitingVouch = step === "awaiting_vouch";
  const running = step === "running";
  const failed = step === "failed";
  const pastInstall =
    hasAddress &&
    (awaitingVouch || running || step === "paused" || failed);

  return [
    {
      id: "create",
      label: "Deploy created",
      done: hasId,
      active: hasId && !hasAddress && !pipeline && step === "provisioning",
    },
    {
      id: "wallet",
      label: "Agent wallet & skill setup",
      done: hasAddress && !pipeline,
      active: pipeline || step === "provisioning" || step === "installing",
    },
    {
      id: "ready",
      label: "Ready for verification",
      done: awaitingVouch || running || status?.verify?.valid === true,
      active: pastInstall && !awaitingVouch && !running && pipeline,
    },
    {
      id: "verify",
      label: "Verify & start playing",
      done: running || status?.verify?.valid === true,
      active: awaitingVouch,
    },
  ];
}

export function deployProgressPercent(
  status: DeployStatusResponse | null | undefined,
  deployId?: string,
): number {
  const steps = deployProgressSteps(status, deployId);
  const doneCount = steps.filter((s) => s.done).length;
  const activeIdx = steps.findIndex((s) => s.active);
  const base = (doneCount / steps.length) * 100;
  if (activeIdx >= 0) {
    return Math.min(base + 100 / steps.length / 2, 99);
  }
  return doneCount === steps.length ? 100 : base;
}

export const DEPLOY_STEP_SHORT_LABELS: Record<string, string> = {
  create: "Create",
  wallet: "Setup",
  ready: "Ready",
  verify: "Verify",
};

export function deployStatusHeadline(
  status: DeployStatusResponse | null | undefined,
  deployId?: string,
): string {
  if (!deployId) return "";
  if (!status) return "Starting deploy…";
  if (status.pipelineRunning) {
    return "Setting up your agent — usually 1–3 minutes";
  }
  switch (status.status) {
    case "provisioning":
      return "Creating agent wallet…";
    case "installing":
      return "Installing skill on the server…";
    case "starting":
      return "Almost ready…";
    case "awaiting_vouch":
      return "Setup complete — verify to go live";
    case "running":
      return "Your agent is live";
    case "failed":
      return "Setup failed";
    case "paused":
      return "Agent paused";
    default:
      return `Status: ${status.status}`;
  }
}
