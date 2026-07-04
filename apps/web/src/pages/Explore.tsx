import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import {
  exploreAgents,
  getExploreStats,
  type ExplorePage,
  type ExploreStats,
} from "../lib/api.js";

function shorten(a: string): string {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

function formatG(stake: string | null): string {
  if (stake === null) return "—";
  return `${(BigInt(stake) / 10n ** 18n).toString()} G$`;
}

export function Explore() {
  const [stats, setStats] = useState<ExploreStats | null>(null);
  const [data, setData] = useState<ExplorePage | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getExploreStats().then(setStats).catch(() => setStats(null));
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
      <main className="page">
        <header className="hero compact">
          <h1>Explore the registry</h1>
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
          </section>
        )}

        <section className="card form">
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
        </section>

        {error && (
          <section className="card">
            <p className="error">{error}</p>
          </section>
        )}

        {data && data.agents.length === 0 && !loading && (
          <section className="card">
            <p className="muted">
              {query ? "No agents match that address." : "No agents registered yet."}
            </p>
          </section>
        )}

        {data && data.agents.length > 0 && (
          <section className="agent-grid">
            {data.agents.map((a) => (
              <div key={a.agent} className="card agent-card">
                <div className="agent-card-head">
                  <p className="row-title" title={a.agent}>
                    {shorten(a.agent)}
                  </p>
                  <span className={`pill ${a.revoked ? "pill-bad" : "pill-ok"}`}>
                    {a.revoked ? "revoked" : "active"}
                  </span>
                </div>
                <div className="agent-card-pills">
                  <span className="pill pill-muted">{formatG(a.stake)}</span>
                  {a.agentProven ? (
                    <span className="pill pill-ok">key attested</span>
                  ) : (
                    <span className="pill pill-warn">key not attested</span>
                  )}
                </div>
                <p className="muted small agent-card-meta" title={a.operator}>
                  by {shorten(a.operator)} ·{" "}
                  {new Date(a.createdAt).toLocaleDateString()}
                </p>
                <div className="agent-card-actions">
                  <Link to={`/verify?agent=${a.agent}`} className="link-sm">
                    Verify
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}

        {data && pageCount > 1 && (
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
              {page} / {pageCount}
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
      </main>
      <Footer />
    </>
  );
}
