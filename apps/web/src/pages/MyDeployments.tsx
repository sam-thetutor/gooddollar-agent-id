import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { ConnectButton, Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import {
  getDeployStatus,
  listDeploysByOwner,
  type DeployAgent,
  type DeployStatusResponse,
} from "../lib/host.js";
import { usePageMeta } from "../lib/usePageMeta.js";

type FilterTab = "all" | "live" | "failed" | "setup";

type RowHealth = "live" | "paused" | "stopped" | "failed" | "deploying" | "unknown";

function processHealth(s: DeployStatusResponse): RowHealth {
  if (s.pipelineRunning) return "deploying";
  if (s.status === "failed") return "failed";
  if (s.status === "paused") return "paused";
  if (s.pm2?.online) return "live";
  if (s.pm2) return "stopped";
  if (["provisioning", "installing", "starting"].includes(s.status)) {
    return "deploying";
  }
  return "unknown";
}

const HEALTH_LABEL: Record<RowHealth, string> = {
  live: "Live",
  paused: "Paused",
  stopped: "Stopped",
  failed: "Failed",
  deploying: "Setting up",
  unknown: "Unknown",
};

function skillName(agent: DeployAgent): string {
  const skill = agent.skills?.[0]?.skillId;
  if (!skill) return "—";
  return skill.split("/").pop() ?? skill;
}

function skillKind(agent: DeployAgent): string {
  const skill = agent.skills?.[0]?.skillId ?? "";
  if (skill.includes("gamearena")) return "GameArena";
  if (skill.includes("claim")) return "Claim bot";
  if (skill.includes("actionorder")) return "ActionOrder";
  return "Agent";
}

function isTestDeploy(name: string): boolean {
  return /^(E2E|Full Deploy Test)/i.test(name.trim());
}

function formatBalance(raw?: string | null): string {
  if (!raw) return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatRecord(perf: DeployStatusResponse["stats"]): string {
  const p = perf?.performance;
  if (!p || p.gamesPlayed === 0) return "—";
  return `${p.wins}W–${p.losses}L`;
}

function formatPnL(perf: DeployStatusResponse["stats"]): string {
  const wallet = perf?.walletPnL;
  if (wallet?.walletDeltaGs != null) {
    return signedGs(wallet.walletDeltaGs);
  }
  const p = perf?.performance;
  if (!p) return "—";
  if (p.gamesPlayed === 0) return "0";
  return signedGs(p.netPnLGs);
}

function signedGs(n: number): string {
  const rounded = Math.round(n);
  return `${rounded >= 0 ? "+" : ""}${rounded}`;
}

function lastActiveLabel(
  agent: DeployAgent,
  status?: DeployStatusResponse,
): string {
  const matchAt =
    status?.stats?.performance?.matches?.[0]?.at ??
    status?.stats?.performance?.recentMatches?.[0]?.at;
  if (matchAt) {
    const sec = Math.floor((Date.now() - new Date(matchAt).getTime()) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return new Date(matchAt).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (status?.pm2?.uptimeMs) return "Active now";
  return new Date(agent.createdAt).toLocaleDateString();
}

function dbStatusHealth(agent: DeployAgent): RowHealth {
  if (agent.status === "running") return "live";
  if (agent.status === "paused") return "paused";
  if (agent.status === "failed") return "failed";
  if (["provisioning", "installing", "starting"].includes(agent.status)) {
    return "deploying";
  }
  return "unknown";
}

export function MyDeployments() {
  usePageMeta(
    "Deployments — GoodAgent",
    "All autonomous agents you deployed on the GoodAgent supervisor.",
  );

  const { address, isConnected } = useAccount();
  const [agents, setAgents] = useState<DeployAgent[] | null>(null);
  const [statusById, setStatusById] = useState<
    Record<string, DeployStatusResponse | null>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [hideTests, setHideTests] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadStatuses = useCallback(async (list: DeployAgent[]) => {
    const results = await Promise.allSettled(
      list.map((a) => getDeployStatus(a.id)),
    );
    const next: Record<string, DeployStatusResponse | null> = {};
    list.forEach((a, i) => {
      const r = results[i];
      next[a.id] = r.status === "fulfilled" ? r.value : null;
    });
    setStatusById(next);
    setLastRefresh(new Date());
  }, []);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const res = await listDeploysByOwner(address);
      setAgents(res.agents);
      setError(null);
      void loadStatuses(res.agents);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [address, loadStatuses]);

  useEffect(() => {
    if (!address) {
      setAgents(null);
      setStatusById({});
      return;
    }
    void refresh();
    const t = setInterval(() => void refresh(), 20000);
    return () => clearInterval(t);
  }, [address, refresh]);

  const enriched = useMemo(() => {
    if (!agents) return [];
    return agents.map((agent) => {
      const status = statusById[agent.id];
      const health = status ? processHealth(status) : dbStatusHealth(agent);
      return { agent, status, health };
    });
  }, [agents, statusById]);

  const filtered = useMemo(() => {
    return enriched.filter(({ agent, health }) => {
      if (hideTests && isTestDeploy(agent.displayName)) return false;
      if (filter === "all") return true;
      if (filter === "live") return health === "live";
      if (filter === "failed")
        return health === "failed" || health === "stopped";
      if (filter === "setup") return health === "deploying";
      return true;
    });
  }, [enriched, filter, hideTests]);

  const counts = useMemo(() => {
    const visible = enriched.filter(
      ({ agent }) => !hideTests || !isTestDeploy(agent.displayName),
    );
    return {
      total: visible.length,
      live: visible.filter(({ health }) => health === "live").length,
      failed: visible.filter(
        ({ health }) => health === "failed" || health === "stopped",
      ).length,
      setup: visible.filter(({ health }) => health === "deploying").length,
    };
  }, [enriched, hideTests]);

  return (
    <>
      <Nav />
      <main className="page deploy-console-page deployments-page">
        {!isConnected ? (
          <div className="deploy-console deployments-console">
            <header className="deployments-console-header">
              <h1>Deployments</h1>
              <p className="muted">
                Connect your wallet to see agents you deployed.
              </p>
            </header>
            <div className="deployments-empty">
              <ConnectButton />
            </div>
          </div>
        ) : error ? (
          <div className="deploy-console-alert">
            <p className="error">{error}</p>
          </div>
        ) : !agents ? (
          <div className="deploy-console deployments-console deploy-console-loading">
            <p className="muted">Loading deployments…</p>
          </div>
        ) : (
          <div className="deploy-console deployments-console">
            <header className="deployments-console-header">
              <div>
                <h1>Deployments</h1>
                <p className="deployments-summary muted">
                  {counts.total} agent{counts.total === 1 ? "" : "s"} ·{" "}
                  {counts.live} live
                  {counts.failed > 0 ? ` · ${counts.failed} need attention` : ""}
                  {lastRefresh && (
                    <>
                      {" "}
                      · refreshed{" "}
                      {Math.max(
                        0,
                        Math.floor((Date.now() - lastRefresh.getTime()) / 1000),
                      )}
                      s ago
                    </>
                  )}
                </p>
              </div>
              <Link className="btn btn-primary btn-sm" to="/deploy">
                Deploy agent
              </Link>
            </header>

            <div className="deployments-toolbar">
              <div className="deployments-tabs" role="tablist">
                {(
                  [
                    ["all", `All (${counts.total})`],
                    ["live", `Live (${counts.live})`],
                    ["failed", `Failed (${counts.failed})`],
                    ["setup", `Setting up (${counts.setup})`],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={filter === tab}
                    className={`deployments-tab${filter === tab ? " active" : ""}`}
                    onClick={() => setFilter(tab)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="deployments-hide-tests">
                <input
                  type="checkbox"
                  checked={hideTests}
                  onChange={(e) => setHideTests(e.target.checked)}
                />
                Hide test deploys
              </label>
            </div>

            {filtered.length === 0 ? (
              <div className="deployments-empty">
                <p className="muted">
                  {agents.length === 0
                    ? "No deployments yet."
                    : "No deployments match this filter."}
                </p>
                <Link className="btn btn-primary btn-sm" to="/deploy">
                  Deploy an agent
                </Link>
              </div>
            ) : (
              <div className="deployments-table-wrap">
                <table className="deployments-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Skill</th>
                      <th>Status</th>
                      <th>Balance</th>
                      <th>Record</th>
                      <th>P&amp;L</th>
                      <th>Last active</th>
                      <th aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(({ agent, status, health }) => {
                      const perf = status?.stats?.performance;
                      const pnl = formatPnL(status?.stats ?? null);
                      const pnlNum =
                        status?.stats?.walletPnL?.walletDeltaGs ??
                        perf?.netPnLGs ??
                        0;
                      const errorLine = agent.lastError?.split("\n")[0];

                      return (
                        <tr
                          key={agent.id}
                          className={`deployments-row deployments-row-${health}${
                            errorLine && health === "failed"
                              ? " deployments-row-error"
                              : ""
                          }`}
                        >
                          <td>
                            <Link
                              className="deployments-name-link"
                              to={`/dashboard/${agent.id}`}
                            >
                              <strong>{agent.displayName}</strong>
                              {isTestDeploy(agent.displayName) && (
                                <span className="deployments-test-badge">
                                  test
                                </span>
                              )}
                            </Link>
                          </td>
                          <td>
                            <span className="deployments-skill-kind">
                              {skillKind(agent)}
                            </span>
                            <span className="muted deployments-skill-id">
                              {skillName(agent)}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`deployments-status deployments-status-${health}`}
                            >
                              {health === "live" && (
                                <span
                                  className="deploy-live-dot"
                                  aria-hidden
                                />
                              )}
                              {HEALTH_LABEL[health]}
                            </span>
                            {errorLine && health === "failed" && (
                              <span
                                className="deployments-status-error"
                                title={agent.lastError ?? undefined}
                              >
                                {errorLine.slice(0, 48)}
                                {errorLine.length > 48 ? "…" : ""}
                              </span>
                            )}
                          </td>
                          <td className="tabular">
                            {status
                              ? `${formatBalance(status.stats?.balances?.gDollarFormatted)} G$`
                              : "…"}
                          </td>
                          <td className="tabular">
                            {status ? formatRecord(status.stats ?? null) : "…"}
                          </td>
                          <td
                            className={`tabular${
                              pnl !== "—" && pnlNum > 0
                                ? " positive"
                                : pnlNum < 0
                                  ? " negative"
                                  : ""
                            }`}
                          >
                            {status ? `${pnl} G$` : "…"}
                          </td>
                          <td className="muted">
                            {lastActiveLabel(agent, status ?? undefined)}
                          </td>
                          <td>
                            <Link
                              className="deployments-open"
                              to={`/dashboard/${agent.id}`}
                              aria-label={`Open ${agent.displayName} dashboard`}
                            >
                              →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
