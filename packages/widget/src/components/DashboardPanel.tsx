import { useEffect, useState } from "react";
import type { DeployAgent } from "../client/host.js";
import { deployNeedsUserVouch } from "../client/host.js";
import {
  celoscanUrl,
  exploreAgentUrl,
  formatStatusLabel,
  shortenAddress,
  skillLabelForDeploy,
  statusTone,
} from "../lib/agent-display.js";
import { useDashboard } from "../hooks/useDashboard.js";

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
  const [selectedId, setSelectedId] = useState(controlledDeployId ?? "");
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    setSelectedId(controlledDeployId ?? "");
  }, [controlledDeployId]);

  const deploys = sortDashboardDeploys(ownerDeploys);
  const selected = deploys.find((d) => d.id === selectedId);

  function openDeploy(id: string, agent?: string | null) {
    setSelectedId(id);
    setShowDetail(true);
    onSelectDeploy?.(id, agent ?? undefined);
  }

  function backToList() {
    setShowDetail(false);
  }

  if (deploysLoading && deploys.length === 0) {
    return <p className="ga-widget-muted">Loading your agents…</p>;
  }
  if (deploysError && deploys.length === 0) {
    return <p className="ga-widget-error">Could not load agents: {deploysError}</p>;
  }
  if (deploys.length === 0) {
    return (
      <div className="ga-widget-section">
        <h3 className="ga-widget-title">Dashboard</h3>
        <p className="ga-widget-muted">No agents yet — deploy one first.</p>
      </div>
    );
  }

  if (showDetail && selected) {
    return (
      <div className="ga-widget-section">
        <DashboardDetail deploy={selected} onBack={backToList} />
      </div>
    );
  }

  return (
    <div className="ga-widget-section">
      <h3 className="ga-widget-title">Dashboard</h3>
      <p className="ga-widget-muted">Pick an agent to monitor and control it.</p>

      {deploysLoading && (
        <p className="ga-widget-muted ga-widget-step-hint">Refreshing…</p>
      )}
      {deploysError && (
        <p className="ga-widget-error">Could not refresh: {deploysError}</p>
      )}

      <ul className="ga-widget-agent-list">
        {deploys.map((agent) => (
          <li key={agent.id}>
            <DashboardListCard
              agent={agent}
              onOpen={() => openDeploy(agent.id, agent.agentAddress)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashboardListCard({
  agent,
  onOpen,
}: {
  agent: DeployAgent;
  onOpen: () => void;
}) {
  const tone = statusTone(agent.status);
  const live = agent.status === "running";

  return (
    <button type="button" className="ga-widget-agent-card" onClick={onOpen}>
      <div className="ga-widget-agent-card-top">
        <div>
          <span className="ga-widget-agent-card-name">{agent.displayName}</span>
          <span className="ga-widget-agent-card-skill">
            {skillLabelForDeploy(agent)}
            {agent.agentAddress ? ` · ${shortenAddress(agent.agentAddress, 8, 4)}` : ""}
          </span>
        </div>
        <span className={`ga-widget-status-pill ga-widget-status-pill-${live ? "ok" : tone}`}>
          {live ? "Live" : formatStatusLabel(agent.status)}
        </span>
      </div>
      <span className="ga-widget-agent-card-cta">Open dashboard →</span>
    </button>
  );
}

function DashboardDetail({
  deploy,
  onBack,
}: {
  deploy: DeployAgent;
  onBack: () => void;
}) {
  const d = useDashboard(deploy.id, deploy);
  const status = d.status;
  const perf = status?.stats?.performance;
  const hostBalances = status?.stats?.balances;
  const balances = hostBalances ?? d.clientBalances;
  const pm2 = status?.pm2;
  const online = pm2?.online ?? status?.status === "running";
  const tone = statusTone(status?.status ?? deploy.status, online);
  const needsVouch = deployNeedsUserVouch(status);
  const agentAddress = status?.agentAddress ?? deploy.agentAddress;
  const canControl =
    d.isOwner &&
    !needsVouch &&
    (status?.status ?? deploy.status) !== "failed";
  const gamesPlayed =
    perf?.gamesPlayed ?? (perf ? perf.wins + perf.losses : 0);

  return (
    <div className="ga-widget-dash-compact">
      <button type="button" className="ga-widget-back-btn" onClick={onBack}>
        ← All agents
      </button>

      <div className="ga-widget-dash-head">
        <div>
          <h4 className="ga-widget-dash-title">
            {status?.displayName ?? deploy.displayName}
          </h4>
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
        <span className={`ga-widget-status-pill ga-widget-status-pill-${tone}`}>
          {online ? "Live" : formatStatusLabel(status?.status ?? deploy.status)}
        </span>
      </div>

      {d.isOwner && (
        <div className="ga-widget-dash-controls">
          {online ? (
            <button
              type="button"
              className="ga-widget-btn"
              disabled={d.busy || !canControl}
              onClick={() => void d.pause()}
            >
              {d.busy ? "…" : "Stop"}
            </button>
          ) : (
            <button
              type="button"
              className="ga-widget-btn ga-widget-btn-primary"
              disabled={d.busy || !canControl}
              onClick={() => void d.resume()}
            >
              {d.busy ? "…" : status?.status === "paused" ? "Resume" : "Start"}
            </button>
          )}
          {needsVouch && (
            <span className="ga-widget-dash-hint">Vouch on Verify tab first</span>
          )}
        </div>
      )}

      <div className="ga-widget-dash-metrics">
        <Metric
          label="G$"
          value={
            balances?.gDollarFormatted ??
            (d.statsLoading ? "…" : "—")
          }
        />
        <Metric
          label="CELO"
          value={
            balances?.celoFormatted ?? (d.statsLoading ? "…" : "—")
          }
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
          value={perf ? `${perf.matchesToday} played` : gamesPlayed ? `${gamesPlayed} total` : "0"}
        />
      </div>

      <div className="ga-widget-dash-status-row">
        <span className={`ga-widget-online-dot${online ? " ga-widget-online-dot-on" : ""}`} />
        <span className="ga-widget-muted">
          {online
            ? "Online and playing"
            : status?.pipelineRunning
              ? "Provisioning…"
              : formatStatusLabel(status?.status ?? deploy.status)}
        </span>
        {status?.verify?.valid && (
          <span className="ga-widget-dash-verified">Agent ID ✓</span>
        )}
      </div>

      {(status?.lastError ?? deploy.lastError) && (
        <p className="ga-widget-error ga-widget-dash-alert">
          {status?.lastError ?? deploy.lastError}
        </p>
      )}

      {d.error && <p className="ga-widget-error">{d.error}</p>}

      {status?.stats?.logTail && (
        <details className="ga-widget-log-details ga-widget-dash-logs">
          <summary>Logs ({status.stats.logTail.split("\n").length} lines)</summary>
          <pre className="ga-widget-log">{status.stats.logTail.slice(-900)}</pre>
        </details>
      )}

      {agentAddress && (
        <div className="ga-widget-dash-links">
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
        </div>
      )}

      {!status && !d.statsLoading && d.busy === false && (
        <p className="ga-widget-muted ga-widget-step-hint">Loading agent status…</p>
      )}
      {status && d.statsLoading && !perf && (
        <p className="ga-widget-muted ga-widget-step-hint">Loading match stats…</p>
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
