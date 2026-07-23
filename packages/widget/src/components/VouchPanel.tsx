import { useEffect, useRef, useState } from "react";
import type { DeployAgent } from "../client/host.js";
import { useVouchFlow } from "../hooks/useVouchFlow.js";
import {
  formatRelative,
  formatStatusLabel,
  shortenAddress,
  skillLabelForDeploy,
  statusTone,
} from "../lib/agent-display.js";
import { AgentDetailPanel } from "./AgentDetailPanel.js";

function sortVouchable(deploys: DeployAgent[]): DeployAgent[] {
  return [...deploys].sort((a, b) => {
    const rank = (s: string) =>
      s === "awaiting_vouch" ? 0 : s === "running" ? 1 : 2;
    const diff = rank(a.status) - rank(b.status);
    if (diff !== 0) return diff;
    return (b.createdAt ?? b.id).localeCompare(a.createdAt ?? a.id);
  });
}

export function VouchPanel({
  agentAddress: controlledAgent,
  deployId: controlledDeployId,
  ownerDeploys = [],
  deploysLoading = false,
  deploysError = null,
  onSelectDeploy,
  onIssued,
}: {
  agentAddress: string;
  deployId?: string;
  ownerDeploys?: DeployAgent[];
  deploysLoading?: boolean;
  deploysError?: string | null;
  onSelectDeploy?: (deployId: string, agentAddress: string) => void;
  onIssued?: (agent: string) => void;
}) {
  const detailRef = useRef<HTMLDivElement>(null);
  const [selectedDeployId, setSelectedDeployId] = useState(controlledDeployId ?? "");
  const [selectedAgent, setSelectedAgent] = useState(controlledAgent ?? "");
  const [showDetail, setShowDetail] = useState(Boolean(controlledAgent));

  useEffect(() => {
    setSelectedDeployId(controlledDeployId ?? "");
  }, [controlledDeployId]);

  useEffect(() => {
    setSelectedAgent(controlledAgent ?? "");
    setShowDetail(Boolean(controlledAgent));
  }, [controlledAgent]);

  const vouchable = sortVouchable(
    ownerDeploys.filter((a) => a.agentAddress),
  );

  const selectedDeploy = vouchable.find((d) => d.id === selectedDeployId);

  function openAgent(id: string, agent: string) {
    setSelectedDeployId(id);
    setSelectedAgent(agent);
    setShowDetail(true);
    onSelectDeploy?.(id, agent);
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function backToList() {
    setShowDetail(false);
  }

  if (deploysLoading && vouchable.length === 0) {
    return <p className="ga-widget-muted">Loading your deployed agents…</p>;
  }
  if (deploysError && vouchable.length === 0) {
    return <p className="ga-widget-error">Could not load agents: {deploysError}</p>;
  }
  if (vouchable.length === 0) {
    return (
      <div className="ga-widget-section">
        <h3 className="ga-widget-title">Verify & vouch</h3>
        <p className="ga-widget-muted">
          No agents with wallet addresses yet. Deploy one on the Deploy tab, or
          wait for provisioning to finish on an existing job.
        </p>
      </div>
    );
  }

  if (showDetail && selectedDeploy && selectedAgent) {
    return (
      <div className="ga-widget-section" ref={detailRef}>
        <AgentDetailPanel deploy={selectedDeploy} onBack={backToList} />

        <div className="ga-widget-detail-divider">
          <h4 className="ga-widget-detail-section-label">Verification steps</h4>
          <VouchSteps
            agentAddress={selectedAgent}
            deployId={selectedDeployId}
            selectedDeploy={selectedDeploy}
            onIssued={onIssued}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ga-widget-section">
      <h3 className="ga-widget-title">Verify & vouch</h3>
      <p className="ga-widget-muted">
        Select an agent to view details and complete verification.
      </p>

      {deploysLoading && (
        <p className="ga-widget-muted ga-widget-step-hint">Refreshing agent list…</p>
      )}
      {deploysError && (
        <p className="ga-widget-error">Could not refresh agents: {deploysError}</p>
      )}

      <AgentList deploys={vouchable} onOpen={openAgent} />
    </div>
  );
}

function AgentList({
  deploys,
  onOpen,
}: {
  deploys: DeployAgent[];
  onOpen: (deployId: string, agentAddress: string) => void;
}) {
  return (
    <ul className="ga-widget-agent-list">
      {deploys.map((agent) => (
        <li key={agent.id}>
          <AgentCard agent={agent} onOpen={() => {
            if (agent.agentAddress) onOpen(agent.id, agent.agentAddress);
          }} />
        </li>
      ))}
    </ul>
  );
}

function AgentCard({
  agent,
  onOpen,
}: {
  agent: DeployAgent;
  onOpen: () => void;
}) {
  const tone = statusTone(agent.status);
  const skill = skillLabelForDeploy(agent);

  return (
    <button type="button" className="ga-widget-agent-card" onClick={onOpen}>
      <div className="ga-widget-agent-card-top">
        <div>
          <span className="ga-widget-agent-card-name">{agent.displayName}</span>
          <span className="ga-widget-agent-card-skill">{skill}</span>
        </div>
        <span className={`ga-widget-status-pill ga-widget-status-pill-${tone}`}>
          {formatStatusLabel(agent.status)}
        </span>
      </div>
      <div className="ga-widget-agent-card-meta">
        {agent.agentAddress && (
          <code>{shortenAddress(agent.agentAddress, 8, 6)}</code>
        )}
        {agent.createdAt && <span>{formatRelative(agent.createdAt)}</span>}
      </div>
      {agent.lastError && (
        <p className="ga-widget-agent-card-error">Needs attention</p>
      )}
      <span className="ga-widget-agent-card-cta">View details →</span>
    </button>
  );
}

function VouchSteps({
  agentAddress,
  deployId,
  selectedDeploy,
  onIssued,
}: {
  agentAddress: string;
  deployId?: string;
  selectedDeploy?: DeployAgent;
  onIssued?: (agent: string) => void;
}) {
  const v = useVouchFlow(agentAddress);
  const [refreshing, setRefreshing] = useState(false);

  async function recheckAttestation() {
    setRefreshing(true);
    try {
      await v.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <p className="ga-widget-muted">
        Complete verification for{" "}
        <strong>{selectedDeploy?.displayName ?? "this agent"}</strong>
        {deployId ? ` · ${deployId.slice(0, 10)}…` : ""}
      </p>

      <ol className="ga-widget-steps">
        <li
          className={`ga-widget-step${
            v.identity?.verified ? " ga-widget-step-done" : ""
          }`}
        >
          <div className="ga-widget-step-head">
            <span className="ga-widget-step-label">GoodDollar human verification</span>
            {v.identity?.verified && (
              <span className="ga-widget-step-badge ga-widget-step-badge-ok">Done</span>
            )}
          </div>
          {v.identityLoading && (
            <p className="ga-widget-muted">Checking GoodDollar status…</p>
          )}
          {v.identityError && (
            <p className="ga-widget-error">Could not load GoodDollar status.</p>
          )}
          {!v.identityLoading && v.identity && !v.identity.verified && (
            <div className="ga-widget-stack">
              <p className="ga-widget-warn">Face verification required.</p>
              {v.fv && (
                <p className="ga-widget-muted">
                  Face verification: {v.fv.isVerified ? "passed" : v.fv.reason ?? "failed"}
                </p>
              )}
              <button
                type="button"
                className="ga-widget-btn"
                disabled={Boolean(v.busy)}
                onClick={() => void v.verifyFv()}
              >
                Verify with GoodDollar
              </button>
            </div>
          )}
          {!v.identityLoading && v.identity?.verified && (
            <p className="ga-widget-ok">Your wallet is verified on GoodDollar.</p>
          )}
        </li>

        <li
          className={`ga-widget-step${
            v.agentProven ? " ga-widget-step-done" : ""
          }`}
        >
          <div className="ga-widget-step-head">
            <span className="ga-widget-step-label">Agent key attestation</span>
            {v.agentProven && (
              <span className="ga-widget-step-badge ga-widget-step-badge-ok">Done</span>
            )}
          </div>
          {v.agentProven ? (
            <p className="ga-widget-ok">
              This agent proved on-chain that it controls its wallet key.
            </p>
          ) : (
            <div className="ga-widget-stack">
              <p className="ga-widget-warn">
                Waiting for the hosted agent to attest its key on Celo. This
                usually completes automatically after deploy provisioning.
              </p>
              <button
                type="button"
                className="ga-widget-btn"
                disabled={refreshing || Boolean(v.busy)}
                onClick={() => void recheckAttestation()}
              >
                {refreshing ? "Checking…" : "Re-check attestation"}
              </button>
            </div>
          )}
        </li>

        <li
          className={`ga-widget-step${
            v.meetsMin ? " ga-widget-step-done" : ""
          }`}
        >
          <div className="ga-widget-step-head">
            <span className="ga-widget-step-label">Accountability bond</span>
            {v.meetsMin && (
              <span className="ga-widget-step-badge ga-widget-step-badge-ok">Done</span>
            )}
          </div>
          {v.meetsMin ? (
            <p className="ga-widget-ok">
              {v.stakeLabel} G$ bonded on-chain (minimum {v.minStakeLabel} G$).
            </p>
          ) : (
            <div className="ga-widget-stack">
              <p className="ga-widget-muted">
                Stake a refundable G$ bond: {v.stakeLabel} / {v.minStakeLabel} G$
                minimum
              </p>
              {!v.approved && (
                <button
                  type="button"
                  className="ga-widget-btn"
                  disabled={Boolean(v.busy) || !v.identity?.verified}
                  onClick={() => void v.approve()}
                >
                  {v.busy === "Approve" ? "Approving…" : "1. Approve G$"}
                </button>
              )}
              {v.approved && (
                <button
                  type="button"
                  className="ga-widget-btn ga-widget-btn-primary"
                  disabled={Boolean(v.busy) || !v.identity?.verified}
                  onClick={() => void v.stake()}
                >
                  {v.busy === "Stake" ? "Staking…" : `2. Stake ${v.minStakeLabel} G$`}
                </button>
              )}
            </div>
          )}
        </li>

        <li
          className={`ga-widget-step${
            v.issued ? " ga-widget-step-done" : ""
          }`}
        >
          <div className="ga-widget-step-head">
            <span className="ga-widget-step-label">Issue Agent ID</span>
            {v.issued && (
              <span className="ga-widget-step-badge ga-widget-step-badge-ok">Done</span>
            )}
          </div>
          {v.issued ? (
            <div className="ga-widget-stack">
              <p className="ga-widget-ok">
                Agent ID issued for {v.issued.slice(0, 10)}…
              </p>
              <p className="ga-widget-muted">
                Open the Dashboard tab to start{" "}
                {selectedDeploy?.displayName ?? "your agent"}.
              </p>
            </div>
          ) : (
            <>
              <p className="ga-widget-muted">
                Sign an Agent ID binding your verified identity to this agent.
              </p>
              <button
                type="button"
                className="ga-widget-btn ga-widget-btn-primary"
                disabled={!v.canIssue || Boolean(v.busy)}
                onClick={() =>
                  void v.issue().then((a) => {
                    if (a) onIssued?.(a);
                  })
                }
              >
                {v.busy === "Issue" ? "Signing…" : "Sign & issue Agent ID"}
              </button>
              {!v.canIssue && v.identity?.verified && !v.busy && (
                <p className="ga-widget-muted ga-widget-step-hint">
                  Complete the steps above before signing.
                </p>
              )}
            </>
          )}
        </li>
      </ol>

      {v.error && <p className="ga-widget-error">{v.error}</p>}
    </>
  );
}
