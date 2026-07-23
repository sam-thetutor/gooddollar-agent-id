import { useCallback, useEffect, useState } from "react";
import type { DeployAgent } from "../client/host.js";
import { deployNeedsUserVouch, signDeployControl } from "../client/host.js";
import { useWidget } from "../context.js";
import {
  celoscanUrl,
  exploreAgentUrl,
  formatStatusLabel,
  parseConfigSummary,
  shortenAddress,
  skillIdForDeploy,
  skillLabelForDeploy,
  statusTone,
} from "../lib/agent-display.js";
import { useDashboard } from "../hooks/useDashboard.js";
import { AgentSelect } from "./AgentSelect.js";
import { SkillConfigFields } from "./SkillConfigFields.js";
import type { SkillConfiguration } from "../types.js";

function sortDashboardDeploys(deploys: DeployAgent[]): DeployAgent[] {
  return [...deploys].sort((a, b) => {
    const rank = (s: string) => {
      if (s === "running") return 0;
      if (s === "awaiting_vouch") return 1;
      if (s === "paused") return 2;
      if (s === "failed") return 4;
      return 3;
    };
    const diff = rank(a.status) - rank(b.status);
    if (diff !== 0) return diff;
    return (b.createdAt ?? b.id).localeCompare(a.createdAt ?? a.id);
  });
}

export function DashboardPanel({
  deployId: controlledDeployId,
  ownerDeploys = [],
  deploysLoading = false,
  deploysError = null,
  onSelectDeploy,
}: {
  deployId: string;
  ownerDeploys?: DeployAgent[];
  deploysLoading?: boolean;
  deploysError?: string | null;
  onSelectDeploy?: (deployId: string, agentAddress?: string | null) => void;
}) {
  const agents = sortDashboardDeploys(
    ownerDeploys.filter((a) => a.agentAddress),
  );
  const [selectedId, setSelectedId] = useState(
    controlledDeployId ?? agents[0]?.id ?? "",
  );

  useEffect(() => {
    if (controlledDeployId && agents.some((a) => a.id === controlledDeployId)) {
      setSelectedId(controlledDeployId);
    }
  }, [controlledDeployId, agents]);

  useEffect(() => {
    if (!selectedId && agents[0]?.id) {
      setSelectedId(agents[0].id);
      onSelectDeploy?.(agents[0].id, agents[0].agentAddress);
    }
  }, [agents, selectedId, onSelectDeploy]);

  const selected = agents.find((d) => d.id === selectedId);

  function handleSelect(id: string, agent: string) {
    setSelectedId(id);
    onSelectDeploy?.(id, agent);
  }

  if (deploysLoading && agents.length === 0) {
    return <p className="ga-widget-muted">Loading your agents…</p>;
  }
  if (deploysError && agents.length === 0) {
    return <p className="ga-widget-error">Could not load agents: {deploysError}</p>;
  }
  if (agents.length === 0) {
    return (
      <div className="ga-widget-section">
        <h3 className="ga-widget-title">Dashboard</h3>
        <p className="ga-widget-muted">No agents yet — deploy and verify one first.</p>
      </div>
    );
  }

  return (
    <div className="ga-widget-section">
      <h3 className="ga-widget-title">Dashboard</h3>
      <p className="ga-widget-muted">Monitor and control your agents.</p>

      {deploysLoading && (
        <p className="ga-widget-muted ga-widget-step-hint">Refreshing…</p>
      )}
      {deploysError && (
        <p className="ga-widget-error">Could not refresh: {deploysError}</p>
      )}

      <AgentSelect
        agents={agents}
        value={selectedId}
        onChange={handleSelect}
        label="Your agents"
      />

      {selected && <DashboardDetail deploy={selected} />}
    </div>
  );
}

function DashboardDetail({ deploy }: { deploy: DeployAgent }) {
  const { wallet, host } = useWidget();
  const d = useDashboard(deploy.id, deploy);
  const status = d.status;
  const skillId =
    status?.skillId ?? skillIdForDeploy(deploy) ?? "gaming/wagering/gamearena_1v1";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState(deploy.displayName);
  const [editConfig, setEditConfig] = useState<SkillConfiguration>(() =>
    parseConfigSummary(deploy.configuration),
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    setEditName(status?.displayName ?? deploy.displayName);
    setEditConfig(
      parseConfigSummary(status?.configuration ?? deploy.configuration),
    );
  }, [
    deploy.id,
    deploy.displayName,
    deploy.configuration,
    status?.displayName,
    status?.configuration,
  ]);

  const saveSettings = useCallback(async () => {
    if (!d.isOwner || !wallet.address) return;
    setSavingSettings(true);
    setSettingsNotice(null);
    setSettingsError(null);
    try {
      const currentName = status?.displayName ?? deploy.displayName;
      if (editName.trim() && editName.trim() !== currentName) {
        const nameAuth = await signDeployControl(
          wallet,
          "display-name",
          deploy.id,
        );
        await host.updateDisplayName(deploy.id, nameAuth, editName.trim());
      }

      const currentConfig = parseConfigSummary(
        status?.configuration ?? deploy.configuration,
      );
      const patch: Record<string, string> = {};
      for (const [key, value] of Object.entries(editConfig)) {
        if (currentConfig[key] !== value) patch[key] = value;
      }
      if (Object.keys(patch).length > 0) {
        const configAuth = await signDeployControl(
          wallet,
          "configuration",
          deploy.id,
        );
        await host.updateConfiguration(deploy.id, configAuth, patch);
      }

      await d.pollLite();
      void d.poll();
      setSettingsNotice("Saved — agent picks this up on the next run.");
      setSettingsOpen(false);
    } catch (e) {
      setSettingsError((e as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }, [
    d,
    wallet,
    host,
    deploy.id,
    deploy.displayName,
    deploy.configuration,
    editName,
    editConfig,
    status?.displayName,
    status?.configuration,
  ]);

  const perf = status?.stats?.performance;
  const hostBalances = status?.stats?.balances;
  const balances = hostBalances ?? d.clientBalances;
  const pm2 = status?.pm2;
  const online =
    d.controlBusy === "starting"
      ? true
      : d.controlBusy === "stopping"
        ? false
        : (pm2?.online ?? status?.status === "running");
  const tone = statusTone(status?.status ?? deploy.status, online);
  const needsVouch = deployNeedsUserVouch(status);
  const agentAddress = status?.agentAddress ?? deploy.agentAddress;
  const canControl =
    d.isOwner &&
    !needsVouch &&
    (status?.status ?? deploy.status) !== "failed";
  const gamesPlayed =
    perf?.gamesPlayed ?? (perf ? perf.wins + perf.losses : 0);
  const displayName = status?.displayName ?? deploy.displayName;

  return (
    <div className="ga-widget-dash-deck">
      <div className="ga-widget-dash-command">
        <div className="ga-widget-dash-command-main">
          <h4 className="ga-widget-dash-title">{displayName}</h4>
          <p className="ga-widget-dash-sub">
            {skillLabelForDeploy(deploy)}
            {agentAddress ? (
              <>
                {" · "}
                <code>{shortenAddress(agentAddress, 8, 4)}</code>
              </>
            ) : null}
          </p>
        </div>
        <div className="ga-widget-dash-command-actions">
          <span className={`ga-widget-status-pill ga-widget-status-pill-${tone}`}>
            {d.controlBusy === "stopping"
              ? "Stopping…"
              : d.controlBusy === "starting"
                ? "Starting…"
                : online
                  ? "Live"
                  : formatStatusLabel(status?.status ?? deploy.status)}
          </span>
          {d.isOwner && (
            <>
              {online ? (
                <button
                  type="button"
                  className="ga-widget-btn ga-widget-btn-compact"
                  disabled={d.controlBusy !== null || !canControl}
                  onClick={() => void d.pause()}
                >
                  {d.controlBusy === "stopping" ? "Stopping…" : "Stop"}
                </button>
              ) : (
                <button
                  type="button"
                  className="ga-widget-btn ga-widget-btn-primary ga-widget-btn-compact"
                  disabled={d.controlBusy !== null || !canControl}
                  onClick={() => void d.resume()}
                >
                  {d.controlBusy === "starting"
                    ? "Starting…"
                    : status?.status === "paused"
                      ? "Resume"
                      : "Start"}
                </button>
              )}
              <button
                type="button"
                className={`ga-widget-btn ga-widget-btn-compact${
                  settingsOpen ? " ga-widget-btn-active" : ""
                }`}
                onClick={() => setSettingsOpen((o) => !o)}
                aria-expanded={settingsOpen}
              >
                Settings
              </button>
            </>
          )}
        </div>
      </div>

      <div className="ga-widget-dash-metrics">
        <Metric
          label="G$"
          value={balances?.gDollarFormatted ?? (d.statsLoading ? "…" : "—")}
        />
        <Metric
          label="CELO"
          value={balances?.celoFormatted ?? (d.statsLoading ? "…" : "—")}
        />
        <Metric
          label="Record"
          value={
            perf
              ? `${perf.wins}W · ${perf.losses}L`
              : d.statsLoading
                ? "…"
                : "—"
          }
        />
        <Metric
          label="Today"
          value={
            perf
              ? `${perf.matchesToday} played`
              : gamesPlayed
                ? `${gamesPlayed} total`
                : "0"
          }
        />
      </div>

      <div className="ga-widget-dash-status-row">
        <span
          className={`ga-widget-online-dot${online ? " ga-widget-online-dot-on" : ""}`}
        />
        <span className="ga-widget-muted">
          {d.controlBusy === "stopping"
            ? "Stopping agent…"
            : d.controlBusy === "starting"
              ? "Starting agent…"
              : online
                ? "Online and playing"
                : status?.pipelineRunning
                  ? "Provisioning…"
                  : formatStatusLabel(status?.status ?? deploy.status)}
        </span>
        {status?.verify?.valid && (
          <span className="ga-widget-dash-verified">Agent ID ✓</span>
        )}
        {agentAddress && (
          <span className="ga-widget-dash-links-inline">
            <a href={celoscanUrl(agentAddress)} target="_blank" rel="noreferrer">
              Celoscan ↗
            </a>
            <a href={exploreAgentUrl(agentAddress)} target="_blank" rel="noreferrer">
              Profile ↗
            </a>
            {d.verifyUrl && (
              <a href={d.verifyUrl} target="_blank" rel="noreferrer">
                Verify ↗
              </a>
            )}
          </span>
        )}
      </div>

      {needsVouch && d.isOwner && (
        <p className="ga-widget-warn ga-widget-dash-hint-bar">
          Complete verification on the Verify tab before changing settings or starting.
        </p>
      )}

      {(status?.lastError ?? deploy.lastError) && (
        <p className="ga-widget-error ga-widget-dash-alert">
          {status?.lastError ?? deploy.lastError}
        </p>
      )}
      {d.error && <p className="ga-widget-error ga-widget-dash-alert">{d.error}</p>}

      {settingsOpen && d.isOwner && (
        <div className="ga-widget-settings-drawer">
          <label className="ga-widget-field ga-widget-config-grid-full">
            <span>Agent name</span>
            <input
              className="ga-widget-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Agent name"
            />
          </label>
          <SkillConfigFields
            skillId={skillId}
            config={editConfig}
            compact
            onChange={(key, value) =>
              setEditConfig((c) => ({ ...c, [key]: value }))
            }
          />
          <div className="ga-widget-settings-drawer-foot">
            <button
              type="button"
              className="ga-widget-btn ga-widget-btn-primary"
              disabled={savingSettings || needsVouch}
              onClick={() => void saveSettings()}
            >
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
            <button
              type="button"
              className="ga-widget-btn ga-widget-btn-compact"
              onClick={() => setSettingsOpen(false)}
            >
              Cancel
            </button>
          </div>
          {settingsNotice && (
            <p className="ga-widget-ok ga-widget-step-hint">{settingsNotice}</p>
          )}
          {settingsError && (
            <p className="ga-widget-error ga-widget-step-hint">{settingsError}</p>
          )}
        </div>
      )}

      {status?.stats?.logTail && (
        <details className="ga-widget-log-details ga-widget-dash-logs">
          <summary>Logs ({status.stats.logTail.split("\n").length} lines)</summary>
          <pre className="ga-widget-log">{status.stats.logTail.slice(-900)}</pre>
        </details>
      )}

      {!status && !d.statsLoading && !d.controlBusy && (
        <p className="ga-widget-muted ga-widget-step-hint">Loading agent status…</p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="ga-widget-dash-metric">
      <span className="ga-widget-dash-metric-label">{label}</span>
      <span className="ga-widget-dash-metric-value">{value}</span>
    </div>
  );
}
