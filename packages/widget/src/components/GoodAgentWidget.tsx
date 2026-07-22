import { useEffect, useState } from "react";
import { WidgetProvider } from "../context.js";
import { useDeployFlow } from "../hooks/useDeployFlow.js";
import type { GoodAgentWidgetProps } from "../types.js";
import { DeployPanel } from "./DeployPanel.js";
import { DashboardPanel } from "./DashboardPanel.js";
import { VouchPanel } from "./VouchPanel.js";
import "../styles/widget.css";

type Tab = "deploy" | "vouch" | "dashboard";

export function GoodAgentWidget({
  config,
  wallet,
  mode = "full",
  deployId: initialDeployId,
  agentAddress: initialAgent,
  onDeployId,
  onVouched,
  onLive,
  className,
  renderSkillConfig,
}: GoodAgentWidgetProps) {
  const [deployId, setDeployId] = useState(initialDeployId ?? "");
  const [agentAddress, setAgentAddress] = useState(initialAgent ?? "");
  const [tab, setTab] = useState<Tab>(
    mode === "vouch" ? "vouch" : mode === "dashboard" ? "dashboard" : "deploy",
  );

  const showTabs = mode === "full";

  return (
    <WidgetProvider config={config} wallet={wallet}>
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

        {wallet.isConnected &&
          (mode === "deploy" || (showTabs && tab === "deploy")) && (
            <DeployPanel
              deployId={deployId}
              renderSkillConfig={renderSkillConfig}
              onDeployId={(id) => {
                setDeployId(id);
                onDeployId?.(id);
              }}
              onAwaitingVouch={(agent, id) => {
                setAgentAddress(agent);
                setDeployId(id);
                if (showTabs) setTab("vouch");
              }}
            />
          )}

        {wallet.isConnected &&
          (mode === "vouch" || (showTabs && tab === "vouch")) && (
            <VouchPanel
              agentAddress={agentAddress}
              onIssued={(a) => {
                onVouched?.(a);
                if (showTabs) setTab("dashboard");
              }}
            />
          )}

        {wallet.isConnected &&
          deployId &&
          (mode === "dashboard" || (showTabs && tab === "dashboard")) && (
            <DashboardPanel deployId={deployId} />
          )}

        {wallet.isConnected && mode === "full" && deployId && (
          <LiveWatcher deployId={deployId} onLive={onLive} />
        )}
      </div>
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
