import { useCallback, useEffect, useMemo, useState } from "react";
import { WidgetProvider, useWidget } from "../context.js";
import { resolveWidgetConfig } from "../defaults.js";
import { useDeployFlow } from "../hooks/useDeployFlow.js";
import { useOwnerDeploys } from "../hooks/useOwnerDeploys.js";
import { parseFvCallback } from "../gooddollar.js";
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

  /** Deploy tab — current provisioning job only. */
  const [deployActiveId, setDeployActiveId] = useState(
    saved?.deployActiveId ?? "",
  );
  /** Verify tab — independent vouch target. */
  const [vouchDeployId, setVouchDeployId] = useState(
    initialVouchDeployId ?? saved?.vouchDeployId ?? "",
  );
  const [vouchAgentAddress, setVouchAgentAddress] = useState(
    initialVouchAgent ?? saved?.vouchAgentAddress ?? "",
  );
  /** Dashboard tab — independent monitor target. */
  const [dashboardDeployId, setDashboardDeployId] = useState(
    saved?.dashboardDeployId ?? "",
  );
  const [tab, setTab] = useState<Tab>(() => {
    if (mode === "vouch") return "vouch";
    if (mode === "dashboard") return "dashboard";
    if (fv) return "vouch";
    return initialTab ?? saved?.tab ?? "deploy";
  });
  const [hydrated, setHydrated] = useState(false);

  const showTabs = mode === "full";

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

  // Resolve vouch agent from deploy list when we have id but no address yet.
  useEffect(() => {
    if (!wallet.address || vouchAgentAddress || !vouchDeployId) return;
    const match = ownerDeploys.find((d) => d.id === vouchDeployId);
    if (match?.agentAddress) setVouchAgentAddress(match.agentAddress);
  }, [wallet.address, vouchDeployId, vouchAgentAddress, ownerDeploys]);

  // Hydrate dashboard default once — does not affect Verify or Deploy tabs.
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
            const s = await host.getDeployStatus(vouchDeployId);
            if (s.agentAddress) setVouchAgentAddress(s.agentAddress);
          } catch {
            // keep empty — user picks from list on Verify tab
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
              className={`ga-widget-tab ${tab === t ? "ga-widget-tab-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "deploy" ? "Deploy" : t === "vouch" ? "Verify" : "Dashboard"}
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
            onDeployId={(id) => {
              setDeployActiveId(id);
              onDeployId?.(id);
            }}
            onAwaitingVouch={(agent, id) => {
              selectVouchTarget(id, agent);
              void refreshDeploys();
            }}
            onGoToVerify={() => {
              if (vouchDeployId) void refreshDeploys();
              if (showTabs) setTab("vouch");
            }}
            onStartNew={() => {
              setDeployActiveId("");
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
