import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import {
  isDeployOwner,
  signDeployControl,
  type DeployAgent,
  type DeployLiveSnapshot,
  type DeployStatusResponse,
} from "../client/host.js";
import { useWidget } from "../context.js";
import {
  fetchAgentBalancesDisplay,
  type AgentBalanceDisplay,
} from "../lib/agent-balances.js";
import { hasGamearenaSkill } from "../lib/deploy-skills.js";

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
    liveMatch: patch.liveMatch === undefined ? base.liveMatch : patch.liveMatch,
    activeArenaMatchId:
      patch.activeArenaMatchId === undefined
        ? base.activeArenaMatchId
        : patch.activeArenaMatchId,
  };
}

function mergeLiteStats(
  prev: DeployStatusResponse["stats"],
  liteStats: DeployStatusResponse["stats"],
): DeployStatusResponse["stats"] {
  if (!liteStats && !prev) return null;
  if (!liteStats) return prev ?? null;
  if (!prev) return liteStats;
  return {
    ...prev,
    logTail: liteStats.logTail ?? prev.logTail,
  };
}

/** Lite polls omit heavy stats — keep the last full snapshot fields. */
function mergeLiteStatus(
  prev: DeployStatusResponse | null,
  lite: DeployStatusResponse,
): DeployStatusResponse {
  return mergeStatus(lite, {
    stats: mergeLiteStats(prev?.stats ?? null, lite.stats ?? null),
    liveMatch: lite.liveMatch ?? null,
    activeArenaMatchId: lite.activeArenaMatchId ?? null,
  });
}

function mergeLiveSnapshot(
  prev: DeployStatusResponse,
  snap: DeployLiveSnapshot,
): DeployStatusResponse {
  return mergeStatus(prev, {
    liveMatch: snap.liveMatch ?? null,
    activeArenaMatchId: snap.activeArenaMatchId ?? null,
    pm2: snap.pm2 ?? prev.pm2,
    stats: snap.logTail
      ? mergeLiteStats(prev.stats ?? null, { logTail: snap.logTail })
      : prev.stats,
  });
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
  const { wallet, host, api, rpcUrl, config } = useWidget();
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [clientBalances, setClientBalances] =
    useState<AgentBalanceDisplay | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [controlBusy, setControlBusy] =
    useState<DashboardControlBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const fullPollInFlight = useRef(false);
  const livePollInFlight = useRef(false);

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
      setStatus((prev) => mergeLiteStatus(prev, lite));
      setError(null);
      return lite;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [deployId, host]);

  const pollFull = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!deployId || fullPollInFlight.current) return null;
      fullPollInFlight.current = true;
      const background = opts?.background ?? false;
      if (!background) setStatsLoading(true);
      try {
        const full = await host.getDeployStatus(deployId);
        setStatus(full);
        setError(null);
        return full;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        fullPollInFlight.current = false;
        if (!background) setStatsLoading(false);
      }
    },
    [deployId, host],
  );

  const pollLiveSnapshot = useCallback(async () => {
    if (!deployId || livePollInFlight.current) return null;
    livePollInFlight.current = true;
    try {
      const snap = await host.getDeployLiveSnapshot(deployId);
      setStatus((prev) => (prev ? mergeLiveSnapshot(prev, snap) : prev));
      return snap;
    } catch {
      return null;
    } finally {
      livePollInFlight.current = false;
    }
  }, [deployId, host]);

  const poll = useCallback(async () => {
    await pollLite();
    return pollFull({ background: true });
  }, [pollLite, pollFull]);

  const agentOnline =
    status?.pm2?.online ??
    (status?.status === "running" || deploy?.status === "running");
  const gamearenaOnline =
    Boolean(status && hasGamearenaSkill(status)) && agentOnline;
  const litePollMs = gamearenaOnline ? 5000 : (config.statusPollMs ?? 5000);
  const livePollMs = gamearenaOnline ? 1000 : null;
  const fullPollMs = gamearenaOnline ? 20_000 : 30_000;

  useEffect(() => {
    if (!deployId) return;
    setStatus(null);
    setClientBalances(null);
    setStatsLoading(true);
    let cancelled = false;

    void (async () => {
      await pollLite();
      if (!cancelled) setStatsLoading(false);
      if (gamearenaOnline) void pollLiveSnapshot();
      void pollFull({ background: true });
    })();

    const liteTimer = setInterval(() => void pollLite(), litePollMs);
    const liveTimer =
      livePollMs != null
        ? setInterval(() => void pollLiveSnapshot(), livePollMs)
        : null;
    const fullTimer = setInterval(
      () => void pollFull({ background: true }),
      fullPollMs,
    );

    return () => {
      cancelled = true;
      clearInterval(liteTimer);
      if (liveTimer) clearInterval(liveTimer);
      clearInterval(fullTimer);
    };
  }, [
    deployId,
    pollLite,
    pollLiveSnapshot,
    pollFull,
    litePollMs,
    livePollMs,
    fullPollMs,
    gamearenaOnline,
  ]);

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
      void pollFull({ background: true });
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
      void pollFull({ background: true });
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
