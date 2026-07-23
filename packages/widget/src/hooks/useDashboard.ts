import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import {
  isDeployOwner,
  signDeployControl,
  type DeployAgent,
  type DeployStatusResponse,
} from "../client/host.js";
import { useWidget } from "../context.js";
import {
  fetchAgentBalancesDisplay,
  type AgentBalanceDisplay,
} from "../lib/agent-balances.js";

function mergeStatus(
  base: DeployStatusResponse,
  patch: Partial<DeployStatusResponse>,
): DeployStatusResponse {
  return {
    ...base,
    ...patch,
    stats: patch.stats === undefined ? base.stats : patch.stats,
    pm2: patch.pm2 === undefined ? base.pm2 : patch.pm2,
    verify: patch.verify === undefined ? base.verify : patch.verify,
  };
}

export function useDashboard(deployId: string, deploy?: DeployAgent) {
  const { wallet, host, api, rpcUrl } = useWidget();
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [clientBalances, setClientBalances] =
    useState<AgentBalanceDisplay | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agentAddress = status?.agentAddress ?? deploy?.agentAddress ?? null;

  useEffect(() => {
    if (!agentAddress) {
      setClientBalances(null);
      return;
    }
    let cancelled = false;
    void fetchAgentBalancesDisplay(rpcUrl, agentAddress as Address)
      .then((balances) => {
        if (!cancelled) setClientBalances(balances);
      })
      .catch(() => {
        if (!cancelled) setClientBalances(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agentAddress, rpcUrl]);

  const poll = useCallback(async () => {
    if (!deployId) return null;
    try {
      const lite = await host.getDeployStatus(deployId, { lite: true });
      setStatus((prev) =>
        mergeStatus(lite, { stats: prev?.stats ?? null }),
      );
      setError(null);

      setStatsLoading(true);
      const full = await host.getDeployStatus(deployId);
      setStatus(full);
      return full;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setStatsLoading(false);
    }
  }, [deployId, host]);

  useEffect(() => {
    if (!deployId) return;
    setStatus(null);
    setClientBalances(null);
    setStatsLoading(true);
    void poll();
    const t = setInterval(() => void poll(), 5000);
    return () => clearInterval(t);
  }, [deployId, poll]);

  const isOwner = isDeployOwner(
    wallet.address,
    status?.ownerWallet ?? deploy?.ownerWallet,
  );

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
    clientBalances,
    statsLoading,
    busy,
    error,
    isOwner,
    pause,
    resume,
    verifyUrl,
    poll,
  };
}
