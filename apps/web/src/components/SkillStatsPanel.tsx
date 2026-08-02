import type { SkillStatsSummary } from "../lib/host.js";

function formatTimeShort(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SkillStatsPanel({
  title,
  stats,
  configRows,
  emptyMessage,
  onEditSettings,
  canEdit,
}: {
  title: string;
  stats: SkillStatsSummary | null | undefined;
  configRows?: Array<{ label: string; value: string }>;
  emptyMessage?: string;
  onEditSettings?: () => void;
  canEdit?: boolean;
}) {
  return (
    <section className="deploy-console-section">
      <div className="deploy-section-head">
        <h2>{title}</h2>
        {canEdit && onEditSettings ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEditSettings}>
            Edit settings
          </button>
        ) : null}
      </div>

      {configRows?.length ? (
        <dl className="deploy-aside-dl">
          {configRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className={row.label.includes("matches") ? "tabular" : undefined}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {stats && stats.gamesPlayed > 0 ? (
        <>
          <div className="deploy-hero-stat" style={{ marginTop: "1rem" }}>
            <span className="deploy-hero-label">Record</span>
            <span className="deploy-hero-value tabular">
              {stats.wins}
              <span className="deploy-hero-record-sep">–</span>
              {stats.losses}
            </span>
            <span className="deploy-hero-meta muted">
              {stats.gamesPlayed} played · {stats.matchesToday} today
            </span>
          </div>
          {stats.summary ? (
            <p className="muted" style={{ fontSize: "0.875rem" }}>
              {stats.summary}
            </p>
          ) : null}
          {stats.matches.length > 0 ? (
            <div className="deploy-match-table-wrap">
              <table className="deploy-match-table">
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Result</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.matches.slice(0, 10).map((m) => (
                    <tr key={`${m.matchId}-${m.at}`}>
                      <td className="tabular">#{m.matchId}</td>
                      <td>
                        <span className={`deploy-result deploy-result-${m.result}`}>
                          {m.result === "won"
                            ? "Won"
                            : m.result === "lost"
                              ? "Lost"
                              : "Pending"}
                        </span>
                      </td>
                      <td className="muted">{formatTimeShort(m.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted deploy-console-empty">
          {emptyMessage ??
            "No activity yet. Stats appear from skill state, activity reports, or runtime logs once the agent is live."}
        </p>
      )}

      {stats?.logTail ? (
        <details className="deploy-console-details" style={{ marginTop: "1rem" }}>
          <summary>Recent logs</summary>
          <pre className="deploy-console-log">{stats.logTail}</pre>
        </details>
      ) : null}
    </section>
  );
}
