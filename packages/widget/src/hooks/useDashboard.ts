import { useCallback, useEffect, useState } from "react";
import {
  isDeployOwner,
  signDeployControl,
  type DeployStatusResponse,
} from "../client/host.js";
import { useWidget } from "../context.js";

export function useDashboard(deployId: string) {
  const { wallet, host, api } = useWidget();
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!deployId) return null;
    const s = await host.getDeployStatus(deployId);
    setStatus(s);
    return s;
  }, [deployId, host]);

  useEffect(() => {
    if (!deployId) return;
    void poll();
    const t = setInterval(() => void poll(), 5000);
    return () => clearInterval(t);
  }, [deployId, poll]);

  const isOwner = isDeployOwner(wallet.address, status?.ownerWallet);

  const pause = useCallback(async () => {
    if (!isOwner || !wallet.address) return;
    setBusy(true);
    setError(null);
    try {
      const auth = await signDeployControl(wallet, "pause", deployId);
      await host.stopDeploy(deployId, auth);
      await poll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [isOwner, wallet, deployId, host, poll]);

  const resume = useCallback(async () => {
    if (!isOwner || !wallet.address) return;
    setBusy(true);
    setError(null);
    try {
      const auth = await signDeployControl(wallet, "resume", deployId);
      await host.startDeploy(deployId, auth);
      await poll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [isOwner, wallet, deployId, host, poll]);

  const verifyUrl =
    status?.agentAddress && status.verify?.valid
      ? api.verifyAgentUrl(status.agentAddress)
      : null;

  return {
    status,
    busy,
    error,
    isOwner,
    pause,
    resume,
    verifyUrl,
    poll,
  };
}
