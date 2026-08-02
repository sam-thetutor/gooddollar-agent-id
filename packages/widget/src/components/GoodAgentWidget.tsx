import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WidgetProvider, useWidget } from "../context.js";
import { deployNeedsUserVouch } from "../client/host.js";
import type { DeployStatusResponse } from "../client/host.js";
import { resolveWidgetConfig } from "../defaults.js";
import { DeploySessionProvider } from "../deploy-session.js";
import { useOwnerDeploys } from "../hooks/useOwnerDeploys.js";
import { parseFvCallback } from "../gooddollar.js";
import { isDeployProvisioning } from "../lib/deploy-progress.js";
import {
  loadWidgetSession,
  saveWidgetSession,
  type WidgetSessionTab,
} from "../session-storage.js";
import type { GoodAgentWidgetMode, GoodAgentWidgetProps } from "../types.js";
import { DeployPanel } from "./DeployPanel.js";
import { DashboardPanel } from "./DashboardPanel.js";
import { VouchPanel } from "./VouchPanel.js";
import { filterToFirstGamearenaDeploy } from "../lib/gamearena-first-deploy.js";
import { GAMEARENA_SKILL_ID } from "../skill-config.js";
import "../styles/widget.css";

type Tab = WidgetSessionTab;

function isTabbedWidgetMode(
  mode: GoodAgentWidgetMode,
): mode is "full" | "onboard" {
  return mode === "full" || mode === "onboard";
}

function visibleTabsForMode(
  mode: GoodAgentWidgetMode,
): readonly Tab[] {
  return mode === "onboard"
    ? (["deploy", "vouch"] as const)
    : (["deploy", "vouch", "dashboard"] as const);
}

function resolveInitialTab(
  mode: GoodAgentWidgetMode,
  opts: {
    fv: boolean;
    initialTab?: Tab;
    savedTab?: Tab;
  },
): Tab {
  if (mode === "vouch") return "vouch";
  if (mode === "dashboard") return "dashboard";
  if (opts.fv) return "vouch";
  let tab = opts.initialTab ?? opts.savedTab ?? "deploy";
  if (mode === "onboard" && tab === "dashboard") tab = "vouch";
  return tab;
}

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
  onOnboardComplete,
  onLive,
  className,
  renderSkillConfig,
}: Omit<GoodAgentWidgetProps, "config" | "wallet">) {
  const { config, wallet, host } = useWidget();
  const {
    agents: ownerDeploysRaw,
    loading: deploysLoading,
    error: deploysError,
    refresh: refreshDeploys,
  } = useOwnerDeploys(wallet.address);

  const gamearenaFirstAgentOnly = config.skillId === GAMEARENA_SKILL_ID;
  const ownerDeploys = useMemo(
    () =>
      filterToFirstGamearenaDeploy(ownerDeploysRaw, gamearenaFirstAgentOnly),
    [ownerDeploysRaw, gamearenaFirstAgentOnly],
  );

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
  const [tab, setTab] = useState<Tab>(() =>
    resolveInitialTab(mode, {
      fv: Boolean(fv),
      initialTab,
      savedTab: saved?.tab,
    }),
  );
  const [hydrated, setHydrated] = useState(false);

  const tabbedMode = isTabbedWidgetMode(mode);
  const visibleTabs = visibleTabsForMode(mode);
  const showTabs = tabbedMode;
  const showDeployPanel =
    mode === "deploy" || (tabbedMode && tab === "deploy");
  const showVouchPanel =
    mode === "vouch" || (tabbedMode && tab === "vouch");
  const showDashboardPanel =
    mode === "dashboard" || (mode === "full" && tab === "dashboard");
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

      if (mode !== "onboard") {
        let dashId = saved?.dashboardDeployId ?? "";
        if (!dashId && list.length) {
          dashId = pickDefaultDashboardDeploy(list);
        }
        if (dashId) setDashboardDeployId(dashId);
      }

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
    mode,
    saved?.dashboardDeployId,
    ownerDeploys,
    refreshDeploys,
    host,
    vouchDeployId,
    vouchAgentAddress,
  ]);

  useEffect(() => {
    if (mode === "onboard") return;
    if (!wallet.address || dashboardDeployId || ownerDeploys.length === 0) {
      return;
    }
    const dashId = pickDefaultDashboardDeploy(ownerDeploys);
    if (dashId) setDashboardDeployId(dashId);
  }, [wallet.address, dashboardDeployId, ownerDeploys, mode]);

  useEffect(() => {
    if (!wallet.address) return;
    const sessionTab =
      mode === "onboard" && tab === "dashboard" ? "vouch" : tab;
    saveWidgetSession(config.partnerId, wallet.address, {
      tab: sessionTab,
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
    mode,
  ]);

  useEffect(() => {
    if (tab === "vouch" || (mode === "full" && tab === "dashboard")) {
      void refreshDeploys();
    }
  }, [tab, refreshDeploys, mode]);

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
          {visibleTabs.map((t) => (
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

      {wallet.isConnected && showDeployPanel && (
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
              tabbedMode &&
              tab === "deploy" &&
              autoSwitchedForDeployRef.current !== id
            ) {
              autoSwitchedForDeployRef.current = id;
              setTab("vouch");
            }
          }}
          onGoToVerify={() => {
            void refreshDeploys();
            if (tabbedMode) setTab("vouch");
          }}
          onStartNew={() => {
            autoSwitchedForDeployRef.current = "";
            setDeployActiveId("");
            setDeployStatus(null);
          }}
        />
      )}

      {wallet.isConnected && showVouchPanel && (
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
              if (mode === "onboard") {
                if (vouchDeployId) {
                  onOnboardComplete?.({
                    deployId: vouchDeployId,
                    agentAddress: a,
                  });
                }
                return;
              }
              if (mode === "full") {
                if (dashboardDeployId !== vouchDeployId && vouchDeployId) {
                  selectDashboardTarget(vouchDeployId);
                }
                setTab("dashboard");
              }
            }}
          />
        )}

      {wallet.isConnected && showDashboardPanel && (
          <DashboardPanel
            deployId={dashboardDeployId}
            ownerDeploys={ownerDeploys}
            deploysLoading={deploysLoading}
            deploysError={deploysError}
            onSelectDeploy={(id) => {
              selectDashboardTarget(id);
            }}
            onLive={onLive}
          />
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
      <DeploySessionProvider config={resolved}>
        <GoodAgentWidgetBody {...rest} />
      </DeploySessionProvider>
    </WidgetProvider>
  );
}

