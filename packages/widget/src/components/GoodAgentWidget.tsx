import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WidgetProvider, useWidget } from "../context.js";
import { deployNeedsUserVouch } from "../client/host.js";
import type { DeployStatusResponse } from "../client/host.js";
import { resolveWidgetConfig } from "../defaults.js";
import { useDeployFlow } from "../hooks/useDeployFlow.js";
import { useOwnerDeploys } from "../hooks/useOwnerDeploys.js";
import { parseFvCallback } from "../gooddollar.js";
import { isDeployProvisioning } from "../lib/deploy-progress.js";
import {
  loadWidgetSession,
  saveWidgetSession,
  type WidgetSessionTab,
} from "../session-storage.js";
import type { GoodAgentWidgetProps } from "../types.js";
import { DeployPanel } from "./DeployPanel.js";
import { DashboardPanel } from "./DashboardPanel.js";
import { VouchPanel } from "./VouchPanel.js";
import "../styles/widget.css";

type Tab = WidgetSessionTab;

function pickDefaultDashboardDeploy(
  agents: Array<{ id: string; status: string; agentAddress: string | null }>,
): string {
  if (!agents.length) return "";
  const withAddress = agents.filter((a) => a.agentAddress);
  const running = withAddress.find((a) => a.status === "running");
  if (running) return running.id;
  const awaiting = withAddress.find((a) => a.status === "awaiting_vouch");
  if (awaiting) return awaiting.id;
  return withAddress[0]?.id ?? agents[0]?.id ?? "";
}

function countPendingVouch(
  agents: Array<{ status: string; agentAddress: string | null }>,
  deployStatus: DeployStatusResponse | null,
): number {
  const ids = new Set<string>();
  for (const a of agents) {
    if (a.agentAddress && a.status === "awaiting_vouch") {
      ids.add(a.agentAddress.toLowerCase());
    }
  }
  if (
    deployStatus?.agentAddress &&
    deployNeedsUserVouch(deployStatus)
  ) {
    ids.add(deployStatus.agentAddress.toLowerCase());
  }
  return ids.size;
}

function GoodAgentWidgetBody({
  mode = "full",
  deployId: initialVouchDeployId,
  agentAddress: initialVouchAgent,
  initialTab,
  onDeployId,
  onVouchSelect,
  onDashboardSelect,
  onVouched,
  onLive,
  className,
  renderSkillConfig,
}: Omit<GoodAgentWidgetProps, "config" | "wallet">) {
  const { config, wallet, host } = useWidget();
  const {
    agents: ownerDeploys,
    loading: deploysLoading,
    error: deploysError,
    refresh: refreshDeploys,
  } = useOwnerDeploys(wallet.address);

  const fv =
    typeof window !== "undefined"
      ? parseFvCallback(new URLSearchParams(window.location.search))
      : null;

  const saved =
    wallet.address && typeof window !== "undefined"
      ? loadWidgetSession(config.partnerId, wallet.address)
      : null;

  const [deployActiveId, setDeployActiveId] = useState(
    saved?.deployActiveId ?? "",
  );
  const [vouchDeployId, setVouchDeployId] = useState(
    initialVouchDeployId ?? saved?.vouchDeployId ?? "",
  );
  const [vouchAgentAddress, setVouchAgentAddress] = useState(
    initialVouchAgent ?? saved?.vouchAgentAddress ?? "",
  );
  const [dashboardDeployId, setDashboardDeployId] = useState(
    saved?.dashboardDeployId ?? "",
  );
  const [deployStatus, setDeployStatus] = useState<DeployStatusResponse | null>(
    null,
  );
  const autoSwitchedForDeployRef = useRef("");
  const [tab, setTab] = useState<Tab>(() => {
    if (mode === "vouch") return "vouch";
    if (mode === "dashboard") return "dashboard";
    if (fv) return "vouch";
    return initialTab ?? saved?.tab ?? "deploy";
  });
  const [hydrated, setHydrated] = useState(false);

  const showTabs = mode === "full";
  const provisioningActive = isDeployProvisioning(deployStatus, deployActiveId);
  const pendingVouchCount = countPendingVouch(ownerDeploys, deployStatus);

  const selectVouchTarget = useCallback(
    (id: string, agent: string) => {
      setVouchDeployId(id);
      setVouchAgentAddress(agent);
      onVouchSelect?.(id, agent);
    },
    [onVouchSelect],
  );

  const selectDashboardTarget = useCallback(
    (id: string) => {
      setDashboardDeployId(id);
      onDashboardSelect?.(id);
    },
    [onDashboardSelect],
  );

  const handleDeployStatus = useCallback(
    (status: DeployStatusResponse | null) => {
      setDeployStatus(status);
      if (status?.agentAddress) void refreshDeploys();
    },
    [refreshDeploys],
  );

  useEffect(() => {
    if (!wallet.address || vouchAgentAddress || !vouchDeployId) return;
    const match = ownerDeploys.find((d) => d.id === vouchDeployId);
    if (match?.agentAddress) setVouchAgentAddress(match.agentAddress);
  }, [wallet.address, vouchDeployId, vouchAgentAddress, ownerDeploys]);

  useEffect(() => {
    if (!wallet.address || hydrated) return;

    void (async () => {
      const list =
        ownerDeploys.length > 0 ? ownerDeploys : await refreshDeploys();

      let dashId = saved?.dashboardDeployId ?? "";
      if (!dashId && list.length) {
        dashId = pickDefaultDashboardDeploy(list);
      }

      if (dashId) setDashboardDeployId(dashId);

      if (vouchDeployId && !vouchAgentAddress) {
        const match = list.find((d) => d.id === vouchDeployId);
        if (match?.agentAddress) setVouchAgentAddress(match.agentAddress);
        else if (vouchDeployId) {
          try {
            const s = await host.getDeployStatus(vouchDeployId, { lite: true });
            if (s.agentAddress) setVouchAgentAddress(s.agentAddress);
          } catch {
            // user picks from Verify list
          }
        }
      }

      setHydrated(true);
    })();
  }, [
    wallet.address,
    hydrated,
    saved?.dashboardDeployId,
    ownerDeploys,
    refreshDeploys,
    host,
    vouchDeployId,
    vouchAgentAddress,
  ]);

  useEffect(() => {
    if (!wallet.address || dashboardDeployId || ownerDeploys.length === 0) {
      return;
    }
    const dashId = pickDefaultDashboardDeploy(ownerDeploys);
    if (dashId) setDashboardDeployId(dashId);
  }, [wallet.address, dashboardDeployId, ownerDeploys]);

  useEffect(() => {
    if (!wallet.address) return;
    saveWidgetSession(config.partnerId, wallet.address, {
      tab,
      deployActiveId: deployActiveId || undefined,
      vouchDeployId: vouchDeployId || undefined,
      vouchAgentAddress: vouchAgentAddress || undefined,
      dashboardDeployId: dashboardDeployId || undefined,
    });
  }, [
    tab,
    deployActiveId,
    vouchDeployId,
    vouchAgentAddress,
    dashboardDeployId,
    wallet.address,
    config.partnerId,
  ]);

  useEffect(() => {
    if (tab === "vouch" || tab === "dashboard") {
      void refreshDeploys();
    }
  }, [tab, refreshDeploys]);

  useEffect(() => {
    if (!deployActiveId || !provisioningActive) return;
    void refreshDeploys();
    const t = setInterval(() => void refreshDeploys(), 5000);
    return () => clearInterval(t);
  }, [deployActiveId, provisioningActive, refreshDeploys]);

  const tabLabels = useMemo(
    () =>
      ({
        deploy: "Deploy",
        vouch:
          pendingVouchCount > 0
            ? `Verify (${pendingVouchCount})`
            : "Verify",
        dashboard: "Dashboard",
      }) as const,
    [pendingVouchCount],
  );

  return (
    <div className={`ga-widget ${className ?? ""}`.trim()}>
      {!wallet.isConnected && (
        <div className="ga-widget-section">
          <p className="ga-widget-muted">Connect your wallet to continue.</p>
          {wallet.connect && (
            <button
              type="button"
              className="ga-widget-btn ga-widget-btn-primary"
              onClick={() => void wallet.connect?.()}
            >
              Connect wallet
            </button>
          )}
        </div>
      )}

      {wallet.isConnected && showTabs && (
        <div className="ga-widget-tabs" role="tablist">
          {(["deploy", "vouch", "dashboard"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`ga-widget-tab ${tab === t ? "ga-widget-tab-active" : ""}${
                t === "vouch" && pendingVouchCount > 0
                  ? " ga-widget-tab-attention"
                  : ""
              }`}
              onClick={() => setTab(t)}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>
      )}

      {wallet.isConnected && (mode === "deploy" || showTabs) && (
        <div
          className={
            showTabs && tab !== "deploy" && mode === "full"
              ? "ga-widget-tab-hidden"
              : undefined
          }
          aria-hidden={showTabs && tab !== "deploy" && mode === "full"}
        >
          <DeployPanel
            deployId={deployActiveId}
            renderSkillConfig={renderSkillConfig}
            onStatusChange={handleDeployStatus}
            onDeployId={(id) => {
              autoSwitchedForDeployRef.current = "";
              setDeployActiveId(id);
              onDeployId?.(id);
              void refreshDeploys();
            }}
            onAwaitingVouch={(agent, id) => {
              selectVouchTarget(id, agent);
              void refreshDeploys();
              if (
                showTabs &&
                tab === "deploy" &&
                autoSwitchedForDeployRef.current !== id
              ) {
                autoSwitchedForDeployRef.current = id;
                setTab("vouch");
              }
            }}
            onGoToVerify={() => {
              void refreshDeploys();
              if (showTabs) setTab("vouch");
            }}
            onStartNew={() => {
              autoSwitchedForDeployRef.current = "";
              setDeployActiveId("");
              setDeployStatus(null);
            }}
          />
        </div>
      )}

      {wallet.isConnected &&
        (mode === "vouch" || (showTabs && tab === "vouch")) && (
          <VouchPanel
            deployId={vouchDeployId}
            agentAddress={vouchAgentAddress}
            ownerDeploys={ownerDeploys}
            deploysLoading={deploysLoading}
            deploysError={deploysError}
            onSelectDeploy={selectVouchTarget}
            onIssued={(a) => {
              onVouched?.(a);
              void refreshDeploys();
              if (dashboardDeployId !== vouchDeployId && vouchDeployId) {
                selectDashboardTarget(vouchDeployId);
              }
              if (showTabs) setTab("dashboard");
            }}
          />
        )}

      {wallet.isConnected &&
        (mode === "dashboard" || (showTabs && tab === "dashboard")) && (
          <DashboardPanel
            deployId={dashboardDeployId}
            ownerDeploys={ownerDeploys}
            deploysLoading={deploysLoading}
            deploysError={deploysError}
            onSelectDeploy={(id) => {
              selectDashboardTarget(id);
            }}
          />
        )}

      {wallet.isConnected && mode === "full" && dashboardDeployId && (
        <LiveWatcher deployId={dashboardDeployId} onLive={onLive} />
      )}
    </div>
  );
}

export function GoodAgentWidget({
  config,
  wallet,
  ...rest
}: GoodAgentWidgetProps) {
  const resolved = useMemo(() => resolveWidgetConfig(config), [config]);

  return (
    <WidgetProvider config={resolved} wallet={wallet}>
      <GoodAgentWidgetBody {...rest} />
    </WidgetProvider>
  );
}

function LiveWatcher({
  deployId,
  onLive,
}: {
  deployId: string;
  onLive?: (id: string) => void;
}) {
  const { isLive } = useDeployFlow({ deployId });

  useEffect(() => {
    if (isLive) onLive?.(deployId);
  }, [isLive, deployId, onLive]);

  return null;
}
