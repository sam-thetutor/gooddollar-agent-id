import { useEffect, useMemo, useState } from "react";
import type { DeployAgent } from "../client/host.js";
import { useVouchFlow } from "../hooks/useVouchFlow.js";
import { AgentSelect } from "./AgentSelect.js";

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
  const agents = useMemo(
    () => sortVouchable(ownerDeploys.filter((a) => a.agentAddress)),
    [ownerDeploys],
  );

  const [selectedId, setSelectedId] = useState(
    controlledDeployId ?? agents[0]?.id ?? "",
  );

  useEffect(() => {
    if (controlledDeployId && agents.some((a) => a.id === controlledDeployId)) {
      setSelectedId(controlledDeployId);
      return;
    }
    if (!selectedId && agents[0]?.id) {
      setSelectedId(agents[0].id);
      if (agents[0].agentAddress) {
        onSelectDeploy?.(agents[0].id, agents[0].agentAddress);
      }
    }
  }, [controlledDeployId, agents, selectedId, onSelectDeploy]);

  const selectedDeploy = agents.find((d) => d.id === selectedId);
  const selectedAgent =
    selectedDeploy?.agentAddress ?? controlledAgent ?? "";

  function handleSelect(id: string, agent: string) {
    setSelectedId(id);
    onSelectDeploy?.(id, agent);
  }

  if (deploysLoading && agents.length === 0) {
    return <p className="ga-widget-muted">Loading your agents…</p>;
  }

  if (deploysError && agents.length === 0) {
    return (
      <p className="ga-widget-error">Could not load agents: {deploysError}</p>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="ga-widget-section">
        <h3 className="ga-widget-title">Verify your agent</h3>
        <p className="ga-widget-muted">
          No agents ready yet. Deploy one on the Deploy tab, or wait for
          provisioning to finish.
        </p>
      </div>
    );
  }

  return (
    <div className="ga-widget-section">
      <h3 className="ga-widget-title">Verify your agent</h3>
      <p className="ga-widget-muted">
        Choose an agent, then complete GoodDollar verification, bond, and Agent
        ID issuance.
      </p>

      {deploysLoading && (
        <p className="ga-widget-muted ga-widget-step-hint">Refreshing list…</p>
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

      {selectedDeploy && selectedAgent && (
        <div className="ga-widget-detail-divider">
          <h4 className="ga-widget-detail-section-label">Verification steps</h4>
          <VouchSteps
            agentAddress={selectedAgent}
            deployId={selectedId}
            selectedDeploy={selectedDeploy}
            onIssued={onIssued}
          />
        </div>
      )}
    </div>
  );
}

function VouchSteps({
  agentAddress,
  deployId: _deployId,
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

  const step1Done = Boolean(v.identity?.verified);
  const step2Done = v.agentProven;
  const step3Done = v.meetsMin;
  const step4Done = Boolean(v.issued);
  const activeStep = !step1Done
    ? 1
    : !step2Done
      ? 2
      : !step3Done
        ? 3
        : !step4Done
          ? 4
          : 0;

  function stepClass(n: number, done: boolean) {
    return [
      "ga-widget-vouch-step",
      done ? "ga-widget-vouch-step-done" : "",
      activeStep === n ? "ga-widget-vouch-step-active" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <>
      <p className="ga-widget-muted ga-widget-vouch-intro">
        Verifying{" "}
        <strong>{selectedDeploy?.displayName ?? "this agent"}</strong>
      </p>

      <ol className="ga-widget-vouch-steps">
        <li className={stepClass(1, step1Done)}>
          <div className="ga-widget-vouch-step-head">
            <span className="ga-widget-vouch-step-num">
              {step1Done ? "✓" : "1"}
            </span>
            <span className="ga-widget-vouch-step-title">GoodDollar</span>
            {step1Done && (
              <span className="ga-widget-step-badge ga-widget-step-badge-ok">
                Done
              </span>
            )}
          </div>
          <div className="ga-widget-vouch-step-body">
            {v.identityLoading && (
              <p className="ga-widget-muted">Checking…</p>
            )}
            {v.identityError && (
              <p className="ga-widget-error">Status unavailable</p>
            )}
            {!v.identityLoading && v.identity && !v.identity.verified && (
              <>
                <p className="ga-widget-warn">Face verify required</p>
                <button
                  type="button"
                  className="ga-widget-btn ga-widget-btn-compact"
                  disabled={Boolean(v.busy)}
                  onClick={() => void v.verifyFv()}
                >
                  Verify
                </button>
              </>
            )}
            {step1Done && (
              <p className="ga-widget-ok">Wallet verified</p>
            )}
          </div>
        </li>

        <li className={stepClass(2, step2Done)}>
          <div className="ga-widget-vouch-step-head">
            <span className="ga-widget-vouch-step-num">
              {step2Done ? "✓" : "2"}
            </span>
            <span className="ga-widget-vouch-step-title">Attestation</span>
            {step2Done && (
              <span className="ga-widget-step-badge ga-widget-step-badge-ok">
                Done
              </span>
            )}
          </div>
          <div className="ga-widget-vouch-step-body">
            {step2Done ? (
              <p className="ga-widget-ok">Key proven on-chain</p>
            ) : (
              <>
                <p className="ga-widget-muted">Waiting for agent key proof</p>
                <button
                  type="button"
                  className="ga-widget-btn ga-widget-btn-compact"
                  disabled={refreshing || Boolean(v.busy) || !step1Done}
                  onClick={() => void recheckAttestation()}
                >
                  {refreshing ? "…" : "Re-check"}
                </button>
              </>
            )}
          </div>
        </li>

        <li className={stepClass(3, step3Done)}>
          <div className="ga-widget-vouch-step-head">
            <span className="ga-widget-vouch-step-num">
              {step3Done ? "✓" : "3"}
            </span>
            <span className="ga-widget-vouch-step-title">Bond</span>
            {step3Done && (
              <span className="ga-widget-step-badge ga-widget-step-badge-ok">
                Done
              </span>
            )}
          </div>
          <div className="ga-widget-vouch-step-body">
            {step3Done ? (
              <p className="ga-widget-ok">{v.stakeLabel} G$ staked</p>
            ) : (
              <>
                <p className="ga-widget-muted">
                  {v.minStakeLabel} G$ minimum
                </p>
                {!v.approved ? (
                  <button
                    type="button"
                    className="ga-widget-btn ga-widget-btn-compact"
                    disabled={Boolean(v.busy) || !step1Done}
                    onClick={() => void v.approve()}
                  >
                    {v.busy === "Approve" ? "…" : "Approve G$"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ga-widget-btn ga-widget-btn-primary ga-widget-btn-compact"
                    disabled={Boolean(v.busy) || !step1Done}
                    onClick={() => void v.stake()}
                  >
                    {v.busy === "Stake" ? "…" : `Stake ${v.minStakeLabel} G$`}
                  </button>
                )}
              </>
            )}
          </div>
        </li>

        <li className={stepClass(4, step4Done)}>
          <div className="ga-widget-vouch-step-head">
            <span className="ga-widget-vouch-step-num">
              {step4Done ? "✓" : "4"}
            </span>
            <span className="ga-widget-vouch-step-title">Agent ID</span>
            {step4Done && (
              <span className="ga-widget-step-badge ga-widget-step-badge-ok">
                Done
              </span>
            )}
          </div>
          <div className="ga-widget-vouch-step-body">
            {step4Done ? (
              <p className="ga-widget-ok">ID issued — open Dashboard</p>
            ) : (
              <>
                <p className="ga-widget-muted">Sign to bind identity</p>
                <button
                  type="button"
                  className="ga-widget-btn ga-widget-btn-primary ga-widget-btn-compact"
                  disabled={!v.canIssue || Boolean(v.busy)}
                  onClick={() =>
                    void v.issue().then((a) => {
                      if (a) onIssued?.(a);
                    })
                  }
                >
                  {v.busy === "Issue" ? "…" : "Sign & issue"}
                </button>
              </>
            )}
          </div>
        </li>
      </ol>

      {v.error && <p className="ga-widget-error">{v.error}</p>}
    </>
  );
}
