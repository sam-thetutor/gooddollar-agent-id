import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { getExploreStats, type ExploreStats } from "../lib/api.js";
import { getPlatformStats, type PlatformStats } from "../lib/host.js";
import { usePageMeta } from "../lib/usePageMeta.js";

function formatNum(n: number): string {
  return n.toLocaleString();
}

function formatGs(raw: string): string {
  const n = BigInt(raw || "0");
  if (n >= 1_000_000n) return `${(Number(n) / 1_000_000).toFixed(1)}M G$`;
  if (n >= 1_000n) return `${(Number(n) / 1_000).toFixed(1)}k G$`;
  return `${n.toString()} G$`;
}

function winRate(wins: number, played: number): number {
  if (played <= 0) return 0;
  return Math.round((wins / played) * 100);
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function skillCategory(skillId: string): string {
  const seg = skillId.split("/")[0] ?? "other";
  if (seg === "gaming") return "Gaming";
  if (seg === "gooddollar") return "GoodDollar";
  if (seg === "work") return "Work";
  if (seg === "social") return "Social";
  return seg;
}

const STATUS_COLORS: Record<string, string> = {
  running: "#4ade80",
  paused: "#8b95a3",
  failed: "#e06a6a",
  awaiting_vouch: "#e0895a",
  provisioning: "#e6b23c",
  pending_payment: "#6b7480",
  installing: "#c4a035",
};

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === 0) {
      setDisplay(value);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started.current) return;
        started.current = true;
        const t0 = performance.now();
        const duration = 1200;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          const eased = 1 - (1 - p) ** 3;
          setDisplay(Math.round(eased * value));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.disconnect();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <span ref={ref} className="stats-kpi-num tabular">
      {display.toLocaleString()}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "gold" | "green" | "blue";
}) {
  return (
    <article className={`stats-kpi stats-kpi--${accent ?? "gold"}`}>
      <span className="stats-kpi-label">{label}</span>
      <span className="stats-kpi-value">
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </span>
      {sub && <span className="stats-kpi-sub">{sub}</span>}
    </article>
  );
}

function StatusBar({
  entries,
  total,
}: {
  entries: Array<[string, number]>;
  total: number;
}) {
  if (!total) return null;
  return (
    <div className="stats-status-bar" role="img" aria-label="Deploy status breakdown">
      <div className="stats-status-track">
        {entries.map(([status, count]) => (
          <div
            key={status}
            className="stats-status-seg"
            style={{
              flex: count,
              background: STATUS_COLORS[status] ?? "var(--muted-2)",
            }}
            title={`${formatStatus(status)}: ${count}`}
          />
        ))}
      </div>
      <ul className="stats-status-legend">
        {entries.map(([status, count]) => (
          <li key={status}>
            <span
              className="stats-status-dot"
              style={{ background: STATUS_COLORS[status] ?? "var(--muted-2)" }}
            />
            <span className="stats-status-name">{formatStatus(status)}</span>
            <span className="stats-status-count">{formatNum(count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProgressRow({
  label,
  meta,
  value,
  max,
  suffix,
  tone = "accent",
}: {
  label: string;
  meta?: string;
  value: number;
  max: number;
  suffix?: string;
  tone?: "accent" | "ok" | "warn";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="stats-progress-row">
      <div className="stats-progress-head">
        <div>
          <span className="stats-progress-label">{label}</span>
          {meta && <span className="stats-progress-meta">{meta}</span>}
        </div>
        <span className="stats-progress-val">
          {formatNum(value)}
          {suffix && <small>{suffix}</small>}
        </span>
      </div>
      <div className="stats-progress-track">
        <div
          className={`stats-progress-fill stats-progress-fill--${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DailyGamesChart({ daily }: { daily: PlatformStats["dailyGames"] }) {
  const max = useMemo(
    () => Math.max(1, ...daily.map((d) => d.total)),
    [daily],
  );
  const peak = useMemo(
    () => daily.reduce((best, d) => (d.total > best.total ? d : best), daily[0]),
    [daily],
  );

  if (!daily.length) {
    return <p className="muted stats-empty">No games in the last 14 days.</p>;
  }

  return (
    <div className="stats-volume">
      {peak && (
        <p className="stats-volume-peak">
          Peak day{" "}
          <strong>{peak.date.slice(5).replace("-", "/")}</strong> —{" "}
          {formatNum(peak.total)} games
        </p>
      )}
      <div className="stats-chart" role="img" aria-label="Games per day">
        {daily.map((row) => {
          const h = Math.max(6, (row.total / max) * 100);
          const isPeak = row.date === peak?.date;
          return (
            <div key={row.date} className="stats-chart-col">
              <span className="stats-chart-tip">{row.total}</span>
              <div
                className={`stats-chart-bar${isPeak ? " stats-chart-bar--peak" : ""}`}
                style={{ height: `${h}%` }}
              />
              <span className="stats-chart-label">
                {row.date.slice(5).replace("-", "/")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Stats() {
  usePageMeta(
    "Platform stats — GoodAgent",
    "Live analytics: Agent IDs issued, hosted deploys, skill installs, and games played across the GoodAgent network.",
  );

  const [registry, setRegistry] = useState<ExploreStats | null>(null);
  const [platform, setPlatform] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getExploreStats(), getPlatformStats()])
      .then(([reg, plat]) => {
        if (cancelled) return;
        setRegistry(reg);
        setPlatform(plat);
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
  }, []);

  const statusEntries = useMemo(
    () =>
      platform
        ? Object.entries(platform.deploys.byStatus).sort((a, b) => b[1] - a[1])
        : [],
    [platform],
  );

  const maxSkillInstalls = useMemo(
    () =>
      platform?.skills.bySkill.reduce((m, s) => Math.max(m, s.total), 0) ?? 1,
    [platform],
  );

  const maxGamesPlayed = useMemo(
    () =>
      platform?.games.bySkill.reduce((m, s) => Math.max(m, s.played), 0) ?? 1,
    [platform],
  );

  const attestationRate = useMemo(() => {
    if (!registry?.total) return 0;
    return Math.round((registry.attested / registry.total) * 100);
  }, [registry]);

  return (
    <>
      <Nav />
      <main className="page page-wide stats-page">
        <header className="stats-hero">
          <div className="stats-hero-copy">
            <p className="stats-live">
              <span className="stats-live-dot" aria-hidden />
              Live network metrics
            </p>
            <h1>Platform analytics</h1>
            <p className="stats-hero-lede">
              Agent identities, hosted deploys, skill adoption, and game activity
              across the GoodAgent network.
            </p>
          </div>
          <div className="stats-hero-links">
            <Link to="/explore" className="btn btn-ghost btn-sm">
              Registry
            </Link>
            <Link to="/deployments" className="btn btn-ghost btn-sm">
              Deployments
            </Link>
          </div>
        </header>

        {error && (
          <div className="card stats-alert">
            <p className="error">{error}</p>
          </div>
        )}

        {loading && !platform && !error && (
          <div className="stats-loading">
            <div className="stats-kpi stats-kpi--skeleton" />
            <div className="stats-kpi stats-kpi--skeleton" />
            <div className="stats-kpi stats-kpi--skeleton" />
            <div className="stats-kpi stats-kpi--skeleton" />
          </div>
        )}

        {(registry || platform) && (
          <>
            <section className="stats-kpi-row" aria-label="Overview">
              <KpiCard
                label="Agent IDs active"
                value={registry?.active ?? 0}
                sub={registry ? `${formatNum(registry.humans)} humans vouching` : undefined}
                accent="gold"
              />
              <KpiCard
                label="Hosted deploys"
                value={platform?.deploys.total ?? 0}
                sub={
                  platform
                    ? `${formatNum(platform.deploys.running)} running now`
                    : undefined
                }
                accent="blue"
              />
              <KpiCard
                label="Skill installs"
                value={platform?.skills.totalInstalls ?? 0}
                sub={
                  platform
                    ? `${platform.skills.bySkill.length} unique skills`
                    : undefined
                }
              />
              <KpiCard
                label="Games played"
                value={platform?.games.total ?? 0}
                sub={
                  platform
                    ? `${formatGs(platform.games.totalWagerGs)} wagered`
                    : undefined
                }
                accent="green"
              />
            </section>

            <div className="stats-bento">
              {registry && (
                <section className="stats-panel stats-panel--identity">
                  <div className="stats-panel-head">
                    <h2>Agent ID registry</h2>
                    <Link to="/explore" className="stats-panel-link">
                      Explore →
                    </Link>
                  </div>
                  <div className="stats-mini-grid">
                    <div className="stats-mini">
                      <span className="stats-mini-val">{formatNum(registry.total)}</span>
                      <span className="stats-mini-lbl">issued</span>
                    </div>
                    <div className="stats-mini">
                      <span className="stats-mini-val">{formatNum(registry.attested)}</span>
                      <span className="stats-mini-lbl">attested</span>
                    </div>
                    <div className="stats-mini">
                      <span className="stats-mini-val">
                        {registry.totalStakedFormatted}
                        <small>G$</small>
                      </span>
                      <span className="stats-mini-lbl">bonded</span>
                    </div>
                  </div>
                  <div className="stats-ring-wrap">
                    <svg className="stats-ring" viewBox="0 0 36 36" aria-hidden>
                      <path
                        className="stats-ring-bg"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="stats-ring-fill"
                        strokeDasharray={`${attestationRate}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="stats-ring-label">
                      <strong>{attestationRate}%</strong>
                      <span>keys attested</span>
                    </div>
                  </div>
                </section>
              )}

              {platform && (
                <section className="stats-panel stats-panel--deploys">
                  <div className="stats-panel-head">
                    <h2>Deploy health</h2>
                    <span className="stats-panel-badge">
                      {formatNum(platform.games.liveNow)} live
                    </span>
                  </div>
                  <div className="stats-deploy-metrics">
                    <div className="stats-deploy-metric">
                      <span className="stats-deploy-metric-val">
                        {formatNum(platform.deploys.running)}
                      </span>
                      <span className="stats-deploy-metric-lbl">running</span>
                    </div>
                    <div className="stats-deploy-metric">
                      <span className="stats-deploy-metric-val stats-deploy-metric-val--ok">
                        {formatNum(platform.deploys.healthy)}
                      </span>
                      <span className="stats-deploy-metric-lbl">healthy</span>
                    </div>
                    <div className="stats-deploy-metric">
                      <span className="stats-deploy-metric-val">
                        {formatNum(platform.deploys.withAgentId)}
                      </span>
                      <span className="stats-deploy-metric-lbl">linked ID</span>
                    </div>
                  </div>
                  <StatusBar
                    entries={statusEntries}
                    total={platform.deploys.total}
                  />
                </section>
              )}

              {platform && platform.skills.bySkill.length > 0 && (
                <section className="stats-panel stats-panel--wide">
                  <div className="stats-panel-head">
                    <h2>Skill adoption</h2>
                    <span className="muted stats-panel-meta">
                      {formatNum(platform.skills.totalInstalls)} total installs
                    </span>
                  </div>
                  <div className="stats-skill-list">
                    {platform.skills.bySkill.map((row) => (
                      <ProgressRow
                        key={row.skillId}
                        label={row.label}
                        meta={`${skillCategory(row.skillId)} · ${row.failed > 0 ? `${row.failed} failed` : "all healthy"}`}
                        value={row.activated}
                        max={maxSkillInstalls}
                        suffix={` / ${formatNum(row.total)}`}
                        tone={row.failed > 0 ? "warn" : "accent"}
                      />
                    ))}
                  </div>
                </section>
              )}

              {platform && platform.games.bySkill.length > 0 && (
                <section className="stats-panel">
                  <div className="stats-panel-head">
                    <h2>Games by skill</h2>
                    <span className="stats-panel-badge stats-panel-badge--muted">
                      {formatNum(platform.games.today)} today
                    </span>
                  </div>
                  <div className="stats-skill-list">
                    {platform.games.bySkill.map((row) => {
                      const rate = winRate(row.wins, row.played);
                      return (
                        <div key={row.skillId} className="stats-game-row">
                          <div className="stats-game-head">
                            <span className="stats-game-name">{row.label}</span>
                            <span className="stats-game-stats">
                              {formatNum(row.played)} played · {rate}% win
                            </span>
                          </div>
                          <div className="stats-game-bars">
                            <div className="stats-game-bar stats-game-bar--played">
                              <div
                                style={{
                                  width: `${(row.played / maxGamesPlayed) * 100}%`,
                                }}
                              />
                            </div>
                            <div className="stats-game-bar stats-game-bar--winrate">
                              <div style={{ width: `${rate}%` }} />
                            </div>
                          </div>
                          <div className="stats-game-foot">
                            <span className="pill pill-ok">{formatNum(row.wins)} W</span>
                            <span className="pill pill-bad">{formatNum(row.losses)} L</span>
                            <span className="stats-game-wager">{formatGs(row.wagerGs)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {platform && (
                <section className="stats-panel">
                  <div className="stats-panel-head">
                    <h2>14-day volume</h2>
                  </div>
                  <DailyGamesChart daily={platform.dailyGames} />
                </section>
              )}

              {platform && platform.payments.total > 0 && (
                <section className="stats-panel stats-panel--compact">
                  <div className="stats-panel-head">
                    <h2>Revenue</h2>
                  </div>
                  <div className="stats-mini-grid">
                    <div className="stats-mini">
                      <span className="stats-mini-val">
                        {formatNum(platform.payments.completed)}
                      </span>
                      <span className="stats-mini-lbl">payments</span>
                    </div>
                    <div className="stats-mini">
                      <span className="stats-mini-val">
                        ${platform.payments.totalUsd}
                      </span>
                      <span className="stats-mini-lbl">USD total</span>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
