import { useVouchFlow } from "../hooks/useVouchFlow.js";

export function VouchPanel({
  agentAddress,
  onIssued,
}: {
  agentAddress: string;
  onIssued?: (agent: string) => void;
}) {
  const v = useVouchFlow(agentAddress);

  if (!agentAddress) {
    return (
      <p className="ga-widget-muted">Deploy an agent first to get an address.</p>
    );
  }

  return (
    <div className="ga-widget-section">
      <h3 className="ga-widget-title">Verify & vouch</h3>
      <p className="ga-widget-muted">
        GoodDollar-verified humans stake a refundable G$ bond and sign an Agent ID
        for <code>{agentAddress.slice(0, 10)}…</code>
      </p>

      {v.issued && (
        <p className="ga-widget-ok">Agent ID issued for {v.issued.slice(0, 10)}…</p>
      )}

      {v.identityError && (
        <p className="ga-widget-error">Could not load GoodDollar status.</p>
      )}

      {v.identity && !v.identity.verified && (
        <div className="ga-widget-stack">
          <p className="ga-widget-warn">GoodDollar verification required.</p>
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

      {v.identity?.verified && !v.agentProven && (
        <p className="ga-widget-warn">Waiting for on-chain agent attestation…</p>
      )}

      {v.identity?.verified && v.agentProven && !v.meetsMin && (
        <div className="ga-widget-stack">
          <p className="ga-widget-muted">
            Bond: {v.stakeLabel} / {v.minStakeLabel} G$ minimum
          </p>
          {!v.approved && (
            <button
              type="button"
              className="ga-widget-btn"
              disabled={Boolean(v.busy)}
              onClick={() => void v.approve()}
            >
              {v.busy === "Approve" ? "Approving…" : "Approve G$"}
            </button>
          )}
          {v.approved && (
            <button
              type="button"
              className="ga-widget-btn"
              disabled={Boolean(v.busy)}
              onClick={() => void v.stake()}
            >
              {v.busy === "Stake" ? "Staking…" : "Stake bond"}
            </button>
          )}
        </div>
      )}

      {v.canIssue && !v.issued && (
        <button
          type="button"
          className="ga-widget-btn ga-widget-btn-primary"
          disabled={Boolean(v.busy)}
          onClick={() =>
            void v.issue().then((a) => {
              if (a) onIssued?.(a);
            })
          }
        >
          {v.busy === "Issue" ? "Issuing…" : "Issue Agent ID"}
        </button>
      )}

      {v.error && <p className="ga-widget-error">{v.error}</p>}
    </div>
  );
}
