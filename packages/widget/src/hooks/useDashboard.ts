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

export type DashboardControlBusy = "stopping" | "starting" | null;

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

function optimisticPaused(
  prev: DeployStatusResponse | null,
): Partial<DeployStatusResponse> {
  const pm2 = prev?.pm2
    ? { ...prev.pm2, online: false, status: "stopped" }
    : { status: "stopped", online: false };
  return { status: "paused", pm2 };
}

function optimisticRunning(
  prev: DeployStatusResponse | null,
): Partial<DeployStatusResponse> {
  const pm2 = prev?.pm2
    ? { ...prev.pm2, online: true, status: "online" }
    : { status: "online", online: true };
  return { status: "running", pm2 };
}

export function useDashboard(deployId: string, deploy?: DeployAgent) {
  const { wallet, host, api, rpcUrl } = useWidget();
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [clientBalances, setClientBalances] =
    useState<AgentBalanceDisplay | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [controlBusy, setControlBusy] =
    useState<DashboardControlBusy>(null);
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

  const pollLite = useCallback(async () => {
    if (!deployId) return null;
    try {
      const lite = await host.getDeployStatus(deployId, { lite: true });
      setStatus((prev) =>
        mergeStatus(lite, { stats: prev?.stats ?? null }),
      );
      setError(null);
      return lite;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [deployId, host]);

  const pollFull = useCallback(async () => {
    if (!deployId) return null;
    setStatsLoading(true);
    try {
      const full = await host.getDeployStatus(deployId);
      setStatus(full);
      setError(null);
      return full;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setStatsLoading(false);
    }
  }, [deployId, host]);

  const poll = useCallback(async () => {
    await pollLite();
    return pollFull();
  }, [pollLite, pollFull]);

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
    if (!isOwner || !wallet.address || controlBusy) return;
    setControlBusy("stopping");
    setError(null);
    setStatus((prev) =>
      prev ? mergeStatus(prev, optimisticPaused(prev)) : prev,
    );
    try {
      const auth = await signDeployControl(wallet, "pause", deployId);
      await host.stopDeploy(deployId, auth);
      await pollLite();
      void pollFull();
    } catch (e) {
      setError((e as Error).message);
      await pollLite();
    } finally {
      setControlBusy(null);
    }
  }, [
    isOwner,
    wallet,
    deployId,
    host,
    pollLite,
    pollFull,
    controlBusy,
  ]);

  const resume = useCallback(async () => {
    if (!isOwner || !wallet.address || controlBusy) return;
    setControlBusy("starting");
    setError(null);
    setStatus((prev) =>
      prev ? mergeStatus(prev, optimisticRunning(prev)) : prev,
    );
    try {
      const auth = await signDeployControl(wallet, "resume", deployId);
      await host.startDeploy(deployId, auth);
      await pollLite();
      void pollFull();
    } catch (e) {
      setError((e as Error).message);
      await pollLite();
    } finally {
      setControlBusy(null);
    }
  }, [
    isOwner,
    wallet,
    deployId,
    host,
    pollLite,
    pollFull,
    controlBusy,
  ]);

  const verifyUrl =
    status?.agentAddress && status.verify?.valid
      ? api.verifyAgentUrl(status.agentAddress)
      : null;

  return {
    status,
    clientBalances,
    statsLoading,
    controlBusy,
    /** @deprecated use controlBusy */
    busy: controlBusy !== null,
    error,
    isOwner,
    pause,
    resume,
    verifyUrl,
    poll,
    pollLite,
  };
}
