import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import {
  exploreAgents,
  getActivity,
  getExploreStats,
  type ActivityEvent,
  type ExplorePage,
  type ExploreStats,
} from "../lib/api.js";

export function shorten(a: string): string {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

export function formatG(stake: string | null): string {
  if (stake === null) return "—";
  return `${(BigInt(stake) / 10n ** 18n).toString()} G$`;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Explore() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ExploreStats | null>(null);
  const [data, setData] = useState<ExplorePage | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getExploreStats().then(setStats).catch(() => setStats(null));
    getActivity().then(setActivity).catch(() => setActivity(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    exploreAgents({ query: query || undefined, page })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, page]);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <Nav />
      <main className="page page-wide">
        <header className="hero compact">
          <h1>Registry explorer</h1>
          <p className="lede">
            Every AI agent a verified GoodDollar human has vouched for on Celo.
          </p>
        </header>

        {stats && (
          <section className="stat-grid">
            <div className="stat">
              <span className="stat-value">{stats.active}</span>
              <span className="stat-label">active agents</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.humans}</span>
              <span className="stat-label">humans vouching</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.totalStakedFormatted}</span>
              <span className="stat-label">G$ bonded</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.attested}</span>
              <span className="stat-label">keys attested</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.revoked}</span>
              <span className="stat-label">revoked</span>
            </div>
          </section>
        )}

        <div className="explorer-layout">
          <section className="explorer-main">
            <div className="card form explorer-search">
              <div className="verify-input">
                <input
                  type="text"
                  placeholder="Search by agent or operator address (0x…)"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value.trim());
                    setPage(1);
                  }}
                />
              </div>
            </div>

            {error && (
              <div className="card">
                <p className="error">{error}</p>
              </div>
            )}

            {data && data.agents.length === 0 && !loading && (
              <div className="card">
                <p className="muted">
                  {query
                    ? "No agents match that address."
                    : "No agents registered yet."}
                </p>
              </div>
            )}

            {data && data.agents.length > 0 && (
              <div className="card x-table-card">
                <table className="x-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Status</th>
                      <th>Bond</th>
                      <th>Key</th>
                      <th>Operator</th>
                      <th>Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map((a) => (
                      <tr
                        key={a.agent}
                        onClick={() => navigate(`/explore/agent/${a.agent}`)}
                      >
                        <td className="mono">
                          <Link
                            to={`/explore/agent/${a.agent}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {shorten(a.agent)}
                          </Link>
                        </td>
                        <td>
                          <span
                            className={`pill ${a.revoked ? "pill-bad" : "pill-ok"}`}
                          >
                            {a.revoked ? "revoked" : "active"}
                          </span>
                        </td>
                        <td className="mono">{formatG(a.stake)}</td>
                        <td>
                          <span
                            className={`pill ${a.agentProven ? "pill-ok" : "pill-warn"}`}
                          >
                            {a.agentProven ? "attested" : "unproven"}
                          </span>
                        </td>
                        <td className="mono muted" title={a.operator}>
                          {shorten(a.operator)}
                        </td>
                        <td className="muted">
                          {new Date(a.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {pageCount > 1 && (
                  <div className="pager">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      ← Prev
                    </button>
                    <span className="muted small">
                      {page} / {pageCount} · {data.total} agents
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={page >= pageCount || loading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="explorer-side">
            <div className="card">
              <h2 className="card-title">Recent activity</h2>
              {!activity && <p className="muted small">Loading…</p>}
              {activity && activity.length === 0 && (
                <p className="muted small">No activity yet.</p>
              )}
              {activity && activity.length > 0 && (
                <ul className="activity-list">
                  {activity.map((e, i) => (
                    <li key={i} className="activity-item">
                      <span
                        className={`activity-dot ${
                          e.type === "agent_id_revoked" ? "dot-bad" : "dot-ok"
                        }`}
                      />
                      <div>
                        <p className="activity-line">
                          {e.type === "agent_id_revoked"
                            ? "Revoked"
                            : "Registered"}{" "}
                          {e.agent ? (
                            <Link
                              to={`/explore/agent/${e.agent}`}
                              className="mono"
                            >
                              {shorten(e.agent)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </p>
                        <p className="muted small activity-time">
                          {timeAgo(e.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <h2 className="card-title">Contracts</h2>
              <ul className="contract-list">
                <li>
                  <span className="muted small">AgentVault</span>
                  <a
                    className="mono link-sm"
                    href="https://celoscan.io/address/0x0409042B55e99Df8c0Feb7525A770838f3A47090"
                    target="_blank"
                    rel="noreferrer"
                  >
                    0x0409…7090 ↗
                  </a>
                </li>
                <li>
                  <span className="muted small">AgentAttestation</span>
                  <a
                    className="mono link-sm"
                    href="https://celoscan.io/address/0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2"
                    target="_blank"
                    rel="noreferrer"
                  >
                    0xe5EF…f6C2 ↗
                  </a>
                </li>
                <li>
                  <span className="muted small">AgentRevocation</span>
                  <a
                    className="mono link-sm"
                    href="https://celoscan.io/address/0xA86a133626989115a6499b6cA67c3c8dA1662137"
                    target="_blank"
                    rel="noreferrer"
                  >
                    0xA86a…2137 ↗
                  </a>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
