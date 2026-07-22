import { useDashboard } from "../hooks/useDashboard.js";

export function DashboardPanel({ deployId }: { deployId: string }) {
  const d = useDashboard(deployId);

  if (!deployId) {
    return <p className="ga-widget-muted">No deploy selected.</p>;
  }

  const perf = d.status?.stats?.performance;
  const pm2 = d.status?.pm2;
  const online = pm2?.online ?? d.status?.status === "running";

  return (
    <div className="ga-widget-section">
      <h3 className="ga-widget-title">Agent dashboard</h3>

      <div className="ga-widget-grid">
        <div className="ga-widget-stat">
          <span className="ga-widget-stat-label">Status</span>
          <span className="ga-widget-stat-value">
            {online ? "Live" : d.status?.status ?? "…"}
          </span>
        </div>
        {perf && (
          <>
            <div className="ga-widget-stat">
              <span className="ga-widget-stat-label">Record</span>
              <span className="ga-widget-stat-value">
                {perf.wins}W–{perf.losses}L
              </span>
            </div>
            <div className="ga-widget-stat">
              <span className="ga-widget-stat-label">Today</span>
              <span className="ga-widget-stat-value">
                {perf.matchesToday} matches
              </span>
            </div>
          </>
        )}
        {d.status?.stats?.balances && (
          <div className="ga-widget-stat">
            <span className="ga-widget-stat-label">Balance</span>
            <span className="ga-widget-stat-value">
              {d.status.stats.balances.gDollarFormatted} G$
            </span>
          </div>
        )}
      </div>

      {d.status?.agentAddress && (
        <p className="ga-widget-muted">
          Agent <code>{d.status.agentAddress.slice(0, 10)}…</code>
          {d.verifyUrl && (
            <>
              {" · "}
              <a href={d.verifyUrl} target="_blank" rel="noreferrer">
                Verify API ↗
              </a>
            </>
          )}
        </p>
      )}

      {d.isOwner && (
        <div className="ga-widget-actions">
          {online ? (
            <button
              type="button"
              className="ga-widget-btn"
              disabled={d.busy}
              onClick={() => void d.pause()}
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="ga-widget-btn ga-widget-btn-primary"
              disabled={d.busy}
              onClick={() => void d.resume()}
            >
              Resume
            </button>
          )}
        </div>
      )}

      {d.status?.stats?.logTail && (
        <pre className="ga-widget-log">{d.status.stats.logTail.slice(-800)}</pre>
      )}

      {d.error && <p className="ga-widget-error">{d.error}</p>}
    </div>
  );
}
