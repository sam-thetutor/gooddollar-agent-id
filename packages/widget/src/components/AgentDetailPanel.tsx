import { useState, type ReactNode } from "react";
import type { DeployAgent } from "../client/host.js";
import { useDeployDetail } from "../hooks/useDeployDetail.js";
import {
  celoscanUrl,
  configHighlights,
  exploreAgentUrl,
  formatRelative,
  formatStatusLabel,
  formatWhen,
  parseConfigSummary,
  shortenAddress,
  skillLabelForDeploy,
  statusTone,
} from "../lib/agent-display.js";
import { skillShortLabel } from "../skill-config.js";

export function AgentDetailPanel({
  deploy,
  onBack,
}: {
  deploy: DeployAgent;
  onBack?: () => void;
}) {
  const detail = useDeployDetail(deploy.id);
  const status = detail.status;
  const [copied, setCopied] = useState(false);

  const online = status?.pm2?.online ?? status?.status === "running";
  const tone = statusTone(status?.status ?? deploy.status, online);
  const skillId = status?.skillId ?? deploy.skills?.[0]?.skillId ?? null;
  const skillLabel = skillId ? skillShortLabel(skillId) : skillLabelForDeploy(deploy);
  const config = parseConfigSummary(status?.configuration ?? deploy.configuration);
  const highlights = configHighlights(skillId, config);
  const perf = status?.stats?.performance;
  const balances = status?.stats?.balances;
  const agentAddress = status?.agentAddress ?? deploy.agentAddress;

  async function copyAddress() {
    if (!agentAddress) return;
    try {
      await navigator.clipboard.writeText(agentAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <div className="ga-widget-agent-detail">
      <div className="ga-widget-agent-detail-header">
        <div>
          {onBack && (
            <button type="button" className="ga-widget-back-btn" onClick={onBack}>
              ← All agents
            </button>
          )}
          <h4 className="ga-widget-agent-detail-title">
            {status?.displayName ?? deploy.displayName}
          </h4>
          <p className="ga-widget-muted ga-widget-agent-detail-subtitle">
            {skillLabel}
            {deploy.template ? ` · ${deploy.template}` : ""}
          </p>
        </div>
        <span className={`ga-widget-status-pill ga-widget-status-pill-${tone}`}>
          {online ? "Live" : formatStatusLabel(status?.status ?? deploy.status)}
        </span>
      </div>

      {detail.loading && !status && (
        <p className="ga-widget-muted">Loading agent details…</p>
      )}
      {detail.error && (
        <p className="ga-widget-error">Could not load details: {detail.error}</p>
      )}

      <div className="ga-widget-detail-grid">
        <DetailStat label="Agent wallet" wide>
          {agentAddress ? (
            <span className="ga-widget-copy-row">
              <code title={agentAddress}>{shortenAddress(agentAddress, 8, 6)}</code>
              <button type="button" className="ga-widget-link-btn" onClick={() => void copyAddress()}>
                {copied ? "Copied" : "Copy"}
              </button>
            </span>
          ) : (
            "—"
          )}
        </DetailStat>
        <DetailStat label="Deploy ID" wide>
          <code>{deploy.id.slice(0, 14)}…</code>
        </DetailStat>
        <DetailStat label="Agent ID">
          {status?.verify?.valid ? (
            <span className="ga-widget-ok">Verified ✓</span>
          ) : status?.verify?.agentProven ? (
            <span className="ga-widget-warn">Attested, not issued</span>
          ) : (
            <span className="ga-widget-muted">Not issued</span>
          )}
        </DetailStat>
        <DetailStat label="Key attestation">
          {status?.verify?.agentProven ? (
            <span className="ga-widget-ok">On-chain ✓</span>
          ) : (
            <span className="ga-widget-muted">Pending</span>
          )}
        </DetailStat>
        <DetailStat label="Created">
          {formatWhen(deploy.createdAt)}
          {deploy.createdAt ? ` (${formatRelative(deploy.createdAt)})` : ""}
        </DetailStat>
        <DetailStat label="Deployed">
          {formatWhen(status?.deployedAt ?? deploy.deployedAt)}
        </DetailStat>
        {balances && (
          <>
            <DetailStat label="G$ balance">{balances.gDollarFormatted} G$</DetailStat>
            <DetailStat label="CELO">{balances.celoFormatted} CELO</DetailStat>
          </>
        )}
        {perf && (
          <>
            <DetailStat label="Record">
              {perf.wins}W – {perf.losses}L
            </DetailStat>
            <DetailStat label="Today">{perf.matchesToday} matches</DetailStat>
          </>
        )}
        {status?.pm2 && (
          <DetailStat label="Process">
            {status.pm2.online ? "Online" : status.pm2.status}
            {status.pm2.memoryMb != null ? ` · ${status.pm2.memoryMb} MB` : ""}
          </DetailStat>
        )}
      </div>

      {highlights.length > 0 && (
        <div className="ga-widget-detail-section">
          <span className="ga-widget-detail-section-label">Configuration</span>
          <div className="ga-widget-tag-row">
            {highlights.map((h) => (
              <span key={h} className="ga-widget-tag">
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      {(status?.lastError ?? deploy.lastError) && (
        <p className="ga-widget-error ga-widget-detail-alert">
          {status?.lastError ?? deploy.lastError}
        </p>
      )}

      {agentAddress && (
        <div className="ga-widget-detail-links">
          <a href={celoscanUrl(agentAddress)} target="_blank" rel="noreferrer">
            Celoscan ↗
          </a>
          <a href={exploreAgentUrl(agentAddress)} target="_blank" rel="noreferrer">
            Public profile ↗
          </a>
          {detail.verifyUrl && (
            <a href={detail.verifyUrl} target="_blank" rel="noreferrer">
              Verify API ↗
            </a>
          )}
        </div>
      )}

      {status?.stats?.logTail && (
        <details className="ga-widget-log-details">
          <summary>Recent logs</summary>
          <pre className="ga-widget-log">{status.stats.logTail.slice(-600)}</pre>
        </details>
      )}
    </div>
  );
}

function DetailStat({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`ga-widget-detail-stat${wide ? " ga-widget-detail-stat-wide" : ""}`}>
      <span className="ga-widget-detail-stat-label">{label}</span>
      <span className="ga-widget-detail-stat-value">{children}</span>
    </div>
  );
}
