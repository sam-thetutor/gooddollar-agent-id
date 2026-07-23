import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount, useSignMessage } from "wagmi";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { API_ORIGIN } from "../lib/site.js";
import {
  getDeployStatus,
  runDeployPipeline,
  setDeployBaseline,
  startDeploy,
  stopDeploy,
  updateDeployConfiguration,
  type DeployStatusResponse,
  type SkillConfiguration,
} from "../lib/host.js";
import { isDeployOwner, signDeployControl } from "../lib/deploy-control.js";
import { deployNeedsUserVouch, issueAgentHref } from "../lib/deploy-vouch.js";
import { GamearenaConfigFields } from "../components/GamearenaConfigFields.js";
import { BalaioConfigFields } from "../components/BalaioConfigFields.js";
import {
  balaioRoleSummary,
  isBalaioSkill,
} from "../lib/balaio-config.js";
import {
  isGamearenaSkill,
  parsePlayMode,
  playModeLabel,
  strategyLabelFromConfig,
} from "../lib/gamearena-config.js";
import { parseSkillConfig } from "../lib/skill-config.js";
import { usePageMeta } from "../lib/usePageMeta.js";

type HealthState = "live" | "paused" | "stopped" | "failed" | "deploying" | "awaiting_vouch" | "unknown";

const REFRESH_MS = 20_000;
const MATCHES_PAGE_SIZE = 10;

function processHealth(s: DeployStatusResponse): HealthState {
  if (s.pipelineRunning) return "deploying";
  if (s.status === "failed") return "failed";
  if (s.status === "paused") return "paused";
  if (s.status === "awaiting_vouch") return "awaiting_vouch";
  if (s.pm2?.online) return "live";
  if (s.pm2) {
    if (s.pm2.status === "stopped" || s.pm2.status === "errored") return "stopped";
    return "stopped";
  }
  if (["provisioning", "installing", "starting"].includes(s.status)) {
    return "deploying";
  }
  return "unknown";
}

const HEALTH_LABEL: Record<HealthState, string> = {
  live: "Live",
  paused: "Paused",
  stopped: "Stopped",
  failed: "Failed",
  deploying: "Deploying",
  awaiting_vouch: "Awaiting vouch",
  unknown: "Unknown",
};

function formatUptime(ms?: number): string {
  if (!ms || ms < 1000) return "—";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTimeShort(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatBalance(raw?: string | null, decimals = 2): string {
  if (!raw) return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (n === 0) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function parseConfig(raw?: string | null): Record<string, string> {
  return parseSkillConfig(raw);
}

function skillLabel(skillId?: string | null): string {
  if (!skillId) return "—";
  return skillId.split("/").pop() ?? skillId;
}

function humanInterval(seconds?: string): string {
  const n = Number(seconds ?? 300);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 60) return `${n}s between matches`;
  if (n % 60 === 0) return `${n / 60}m between matches`;
  return `${n}s between matches`;
}

function matchPnL(
  result: string,
  wagerGs: number,
  offchain: boolean,
): string {
  if (offchain || wagerGs === 0) return "—";
  if (result === "won") return `+${wagerGs}`;
  if (result === "lost") return `−${wagerGs}`;
  return "0";
}

function signedGs(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function pnlClass(n: number | null | undefined): string {
  if (n == null || n === 0) return "";
  return n > 0 ? " positive" : " negative";
}

function secondsAgo(iso: Date): number {
  return Math.max(0, Math.floor((Date.now() - iso.getTime()) / 1000));
}

export function DeployDashboard() {
  const { id } = useParams<{ id: string }>();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [showBaselineForm, setShowBaselineForm] = useState(false);
  const [baselineInput, setBaselineInput] = useState("");
  const [matchesPage, setMatchesPage] = useState(0);
  const [editingConfig, setEditingConfig] = useState(false);
  const [draftConfig, setDraftConfig] = useState<SkillConfiguration>({});
  const [configBusy, setConfigBusy] = useState(false);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!id || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      setStatus(await getDeployStatus(id));
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      refreshInFlight.current = false;
    }
  }, [id]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!editingConfig) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !configBusy) setEditingConfig(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingConfig, configBusy]);

  const closeSettingsModal = () => {
    if (configBusy) return;
    setEditingConfig(false);
  };

  const health = useMemo(
    () => (status ? processHealth(status) : "unknown"),
    [status],
  );
  const config = useMemo(
    () => parseConfig(status?.configuration),
    [status?.configuration],
  );

  const perf = status?.stats?.performance;
  const playMode = isGamearenaSkill(status?.skillId)
    ? parsePlayMode(config)
    : null;
  const offchainPlay =
    (isGamearenaSkill(status?.skillId) && playMode !== "onchain") ||
    perf?.playMode === "offchain";
  const onchainGamearena =
    isGamearenaSkill(status?.skillId) &&
    (playMode === "onchain" || (!offchainPlay && playMode !== "auto"));
  const autoGamearena = playMode === "auto";
  const walletPnL = status?.stats?.walletPnL;
  const balances = status?.stats?.balances;
  const gBalance = formatBalance(balances?.gDollarFormatted, 0);
  const allMatches = perf?.matches ?? perf?.recentMatches ?? [];
  const matchesTotalPages = Math.max(
    1,
    Math.ceil(allMatches.length / MATCHES_PAGE_SIZE),
  );
  const safeMatchesPage = Math.min(matchesPage, matchesTotalPages - 1);
  const pageMatches = allMatches.slice(
    safeMatchesPage * MATCHES_PAGE_SIZE,
    safeMatchesPage * MATCHES_PAGE_SIZE + MATCHES_PAGE_SIZE,
  );

  const winRate = useMemo(() => {
    if (!perf || perf.gamesPlayed === 0) return null;
    return Math.round((perf.wins / perf.gamesPlayed) * 100);
  }, [perf]);

  const canControl = isDeployOwner(address, status?.ownerWallet);

  const signControl = useCallback(
    async (
      action: "pause" | "resume" | "baseline" | "configuration" | "run-pipeline",
    ) => {
      if (!id || !address) {
        throw new Error("Connect the owner wallet to control this agent.");
      }
      if (!canControl) {
        throw new Error("Only the deploy owner wallet can control this agent.");
      }
      return signDeployControl(action, id, address, (args) =>
        signMessageAsync(args),
      );
    },
    [address, canControl, id, signMessageAsync],
  );

  const nextMatchIn = useMemo(() => {
    void tick;
    if (health !== "live") return null;
    const intervalSec = Number(config.MATCH_INTERVAL_SECONDS ?? 300);
    if (!Number.isFinite(intervalSec) || intervalSec <= 0) return null;
    const lastAt = allMatches[0]?.at;
    if (!lastAt) return intervalSec;
    const elapsed = secondsAgo(new Date(lastAt));
    return Math.max(0, intervalSec - elapsed);
  }, [tick, health, config.MATCH_INTERVAL_SECONDS, allMatches]);

  const updatedLabel = useMemo(() => {
    void tick;
    if (!lastUpdated) return null;
    const sec = secondsAgo(lastUpdated);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    return formatTimeShort(lastUpdated.toISOString());
  }, [tick, lastUpdated]);

  usePageMeta(
    status?.displayName
      ? `${status.displayName} — GoodAgent`
      : "Agent dashboard — GoodAgent",
    "Live status for your deployed autonomous agent.",
  );

  const copyWallet = async () => {
    if (!status?.agentAddress) return;
    try {
      await navigator.clipboard.writeText(status.agentAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const submitBaseline = async () => {
    if (!id) return;
    const n = Number(baselineInput);
    if (!Number.isFinite(n) || n < 0) {
      setError("Starting balance must be a non-negative number.");
      return;
    }
    setBaselineBusy(true);
    try {
      const auth = await signControl("baseline");
      await setDeployBaseline(id, n, auth);
      setShowBaselineForm(false);
      setBaselineInput("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBaselineBusy(false);
    }
  };

  const beginEditConfig = () => {
    setDraftConfig({ ...config });
    setEditingConfig(true);
  };

  const submitConfig = async () => {
    if (!id) return;
    setConfigBusy(true);
    try {
      const auth = await signControl("configuration");
      await updateDeployConfiguration(id, draftConfig, auth);
      setEditingConfig(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfigBusy(false);
    }
  };

  if (!id) {
    return (
      <>
        <Nav />
        <main className="page">
          <p>Missing deploy id.</p>
        </main>
      </>
    );
  }

  const verifyUrl = status?.agentAddress
    ? `${API_ORIGIN}/agent/verify/${status.agentAddress}`
    : null;
  const profileUrl = status?.agentAddress
    ? `/explore/agent/${status.agentAddress}`
    : null;
  const celoscanUrl = status?.agentAddress
    ? `https://celoscan.io/address/${status.agentAddress}`
    : null;

  const wagerGs = config.WAGER_GS ?? String(perf?.wagerGs ?? "—");
  const lowBalance =
    onchainGamearena &&
    balances &&
    Number(balances.gDollarFormatted) < Number(wagerGs);

  return (
    <>
      <Nav />

      {status && (
        <div className={`deploy-console-sticky deploy-console-sticky-${health}`}>
          <div className="deploy-console-sticky-inner">
            <div className="deploy-console-sticky-left">
              <Link to="/deployments" className="deploy-console-sticky-back">
                ←
              </Link>
              <span className="deploy-console-sticky-name">
                {status.displayName ?? id.slice(0, 8)}
              </span>
              {health === "live" && (
                <span className="deploy-live-dot" aria-hidden />
              )}
              <span className="deploy-console-sticky-status">
                {HEALTH_LABEL[health]}
              </span>
            </div>
            <div className="deploy-console-sticky-right">
              <span className="deploy-console-sticky-balance tabular">
                {gBalance} G$
              </span>
              {canControl &&
                (isGamearenaSkill(status?.skillId) ||
                  isBalaioSkill(status?.skillId)) &&
                isConnected && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={configBusy}
                    onClick={beginEditConfig}
                  >
                    Edit
                  </button>
                )}
              {canControl && health === "live" ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || !isConnected}
                  onClick={() => {
                    setBusy(true);
                    void signControl("pause")
                      .then((auth) => stopDeploy(id!, auth))
                      .then(() => refresh())
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : String(e)),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Pause
                </button>
              ) : canControl && health === "awaiting_vouch" ? (
                <>
                  {status.agentAddress && (
                    <Link
                      className="btn btn-ghost btn-sm"
                      to={issueAgentHref(status.agentAddress, id!)}
                    >
                      Vouch
                    </Link>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={
                      busy || !status.pm2Name || !isConnected || !status.verify?.valid
                    }
                    onClick={() => {
                      setBusy(true);
                      void signControl("resume")
                        .then((auth) => startDeploy(id!, auth))
                        .then(() => setError(null))
                        .then(() => refresh())
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : String(e)),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    Start
                  </button>
                </>
              ) : canControl ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !status.pm2Name || !isConnected}
                  onClick={() => {
                    setBusy(true);
                    void signControl("resume")
                      .then((auth) => startDeploy(id!, auth))
                      .then((res) => {
                        if ("reprovisioning" in res && res.reprovisioning) {
                          setError(
                            "Re-provisioning agent on the server — this may take a minute…",
                          );
                        } else {
                          setError(null);
                        }
                      })
                      .then(() => refresh())
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : String(e)),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Resume
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <main className="page deploy-console-page">
        {error && (
          <div className="deploy-console-alert">
            <p className="error">{error}</p>
          </div>
        )}

        {!status ? (
          <div className="deploy-console">
            <header className="deploy-console-header">
              <div className="deploy-console-header-main">
                <Link to="/deployments" className="deploy-console-back">
                  ← All deployments
                </Link>
                <h1>Agent {id.slice(0, 8)}…</h1>
                <p className="deploy-console-subtitle muted">Loading live status…</p>
              </div>
            </header>
            <section className="deploy-console-hero deploy-console-skeleton" aria-hidden>
              <div className="deploy-hero-primary deploy-skeleton-block" />
              <div className="deploy-hero-stat deploy-skeleton-block" />
              <div className="deploy-hero-stat deploy-skeleton-block" />
              <div className="deploy-hero-stat deploy-skeleton-block" />
            </section>
          </div>
        ) : (
          <div className="deploy-console">
            <header className="deploy-console-header">
              <div className="deploy-console-header-main">
                <Link to="/deployments" className="deploy-console-back">
                  ← All deployments
                </Link>
                <h1>{status.displayName ?? `Deploy ${id.slice(0, 8)}…`}</h1>
                <p className="deploy-console-subtitle">
                  {skillLabel(status.skillId)}
                  {status.verify?.valid && (
                    <>
                      <span className="deploy-console-sep">·</span>
                      Agent ID verified
                    </>
                  )}
                  {status.agentAddress && (
                    <>
                      <span className="deploy-console-sep">·</span>
                      <button
                        type="button"
                        className="deploy-console-wallet-btn"
                        onClick={() => void copyWallet()}
                        title={status.agentAddress}
                      >
                        <code>{shortenAddress(status.agentAddress)}</code>
                        <span>{copied ? "Copied" : "Copy"}</span>
                      </button>
                    </>
                  )}
                </p>
              </div>
              <div className="deploy-console-actions">
                {status.status === "failed" && canControl && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || !isConnected}
                    onClick={() => {
                      setBusy(true);
                      void signControl("run-pipeline")
                        .then((auth) => runDeployPipeline(id, auth))
                        .then(() => refresh())
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : String(e)),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    Retry deploy
                  </button>
                )}
                {profileUrl && (
                  <Link className="btn btn-ghost btn-sm" to={profileUrl}>
                    Profile
                  </Link>
                )}
                {verifyUrl && (
                  <a
                    className="btn btn-ghost btn-sm"
                    href={verifyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Verify API
                  </a>
                )}
                {celoscanUrl && (
                  <a
                    className="btn btn-ghost btn-sm"
                    href={celoscanUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Celoscan
                  </a>
                )}
              </div>
            </header>

            {status && deployNeedsUserVouch(status) && status.agentAddress && id && (
              <section className="deploy-vouch-card deploy-console-vouch" aria-label="Vouch required">
                <h2 className="card-title">Vouch required before play</h2>
                <p className="muted hint">
                  Wallet funded and skill installed. Issue an Agent ID with your
                  verified wallet, then return here to start the agent.
                </p>
                <div className="actions">
                  <Link
                    className="btn btn-primary"
                    to={issueAgentHref(status.agentAddress, id)}
                  >
                    Vouch at /issue
                  </Link>
                  <Link className="btn btn-ghost" to={`/deploy?job=${id}`}>
                    Deploy status
                  </Link>
                </div>
              </section>
            )}

            {lowBalance && health === "live" && (
              <p className="deploy-console-banner">
                Low G$ balance — send funds to{" "}
                <code>{status.agentAddress}</code> to keep on-chain wagering.
              </p>
            )}

            <section className="deploy-console-hero" aria-label="Performance summary">
              <div className="deploy-hero-primary">
                <span className="deploy-hero-label">Balance</span>
                <span className="deploy-hero-balance tabular">
                  {gBalance}
                  <small>G$</small>
                </span>
              </div>
              <div className="deploy-hero-stat">
                <span className="deploy-hero-label">
                  {offchainPlay ? "Tickets today" : "P&amp;L"}
                </span>
                <span
                  className={`deploy-hero-value tabular${
                    offchainPlay ? "" : pnlClass(walletPnL?.walletDeltaGs ?? perf?.netPnLGs)
                  }`}
                >
                  {offchainPlay
                    ? `${perf?.matchesToday ?? 0}`
                    : walletPnL?.walletDeltaGs != null
                      ? signedGs(walletPnL.walletDeltaGs)
                      : perf
                        ? signedGs(perf.netPnLGs)
                        : "0"}
                  <small>{offchainPlay ? "played" : "G$"}</small>
                </span>
                {offchainPlay ? (
                  <span className="deploy-hero-meta muted">
                    cap {config.DAILY_MATCH_CAP ?? "50"}/day
                  </span>
                ) : (
                  walletPnL?.baselineBalanceGs == null &&
                  canControl &&
                  (showBaselineForm ? (
                    <span className="deploy-baseline-form">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="deploy-baseline-input"
                        placeholder="200"
                        value={baselineInput}
                        onChange={(e) => setBaselineInput(e.target.value)}
                        disabled={baselineBusy}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void submitBaseline()}
                        disabled={baselineBusy}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowBaselineForm(false)}
                        disabled={baselineBusy}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="deploy-baseline-link"
                      onClick={() => setShowBaselineForm(true)}
                    >
                      Set baseline
                    </button>
                  ))
                )}
              </div>
              <div className="deploy-hero-stat">
                <span className="deploy-hero-label">Record</span>
                <span className="deploy-hero-value tabular">
                  {perf?.wins ?? 0}
                  <span className="deploy-hero-record-sep">–</span>
                  {perf?.losses ?? 0}
                </span>
                {perf && perf.gamesPlayed > 0 && (
                  <span className="deploy-hero-meta muted">
                    {perf.gamesPlayed}
                    {winRate != null ? ` · ${winRate}%` : ""}
                  </span>
                )}
              </div>
              <div className="deploy-hero-stat">
                <span className="deploy-hero-label">
                  {offchainPlay ? "Tickets" : "CELO"}
                </span>
                <span className="deploy-hero-value tabular">
                  {offchainPlay
                    ? (config.DAILY_MATCH_CAP ?? "50")
                    : formatBalance(balances?.celoFormatted, 3)}
                </span>
                {offchainPlay && (
                  <span className="deploy-hero-meta muted">daily cap</span>
                )}
              </div>
            </section>

            <div className="deploy-console-body">
              <div className="deploy-console-main">
                <section className="deploy-console-section">
                  <div className="deploy-section-head">
                    <h2>Match history</h2>
                    {updatedLabel && (
                      <span className="deploy-section-meta muted">
                        Updated {updatedLabel}
                      </span>
                    )}
                  </div>

                  {perf && perf.gamesPlayed > 0 && (
                    <div className="deploy-wl-bar" aria-hidden>
                      <div
                        className="deploy-wl-bar-wins"
                        style={{
                          flexGrow: Math.max(perf.wins, 0.05),
                        }}
                      />
                      <div
                        className="deploy-wl-bar-losses"
                        style={{
                          flexGrow: Math.max(perf.losses, 0.05),
                        }}
                      />
                    </div>
                  )}

                  {pageMatches.length > 0 ? (
                    <div className="deploy-match-table-wrap">
                      <table className="deploy-match-table">
                        <thead>
                          <tr>
                            <th>Match</th>
                            <th>Result</th>
                            {!offchainPlay && <th>P&amp;L</th>}
                            {!offchainPlay && <th>Wager</th>}
                            <th>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageMatches.map((m) => (
                            <tr key={`${m.matchId}-${m.at}`}>
                              <td className="tabular">#{m.matchId}</td>
                              <td>
                                <span
                                  className={`deploy-result deploy-result-${m.result}`}
                                >
                                  {m.result === "won"
                                    ? "Won"
                                    : m.result === "lost"
                                      ? "Lost"
                                      : "Pending"}
                                </span>
                              </td>
                              {!offchainPlay && (
                                <td
                                  className={`tabular${
                                    m.result === "won"
                                      ? " positive"
                                      : m.result === "lost"
                                        ? " negative"
                                        : ""
                                  }`}
                                >
                                  {matchPnL(m.result, m.wagerGs, offchainPlay)} G$
                                </td>
                              )}
                              {!offchainPlay && (
                                <td className="tabular muted">{m.wagerGs} G$</td>
                              )}
                              <td className="muted">
                                {formatTimeShort(m.at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {allMatches.length > MATCHES_PAGE_SIZE && (
                        <div className="deploy-match-pagination">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={safeMatchesPage === 0}
                            onClick={() =>
                              setMatchesPage((p) => Math.max(0, p - 1))
                            }
                          >
                            Newer
                          </button>
                          <span className="deploy-match-pagination-meta muted">
                            {safeMatchesPage + 1} / {matchesTotalPages}
                            <span className="deploy-match-pagination-count">
                              ({allMatches.length})
                            </span>
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={safeMatchesPage >= matchesTotalPages - 1}
                            onClick={() =>
                              setMatchesPage((p) =>
                                Math.min(matchesTotalPages - 1, p + 1),
                              )
                            }
                          >
                            Older
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="deploy-console-empty">
                      No completed matches yet. The agent will appear here once
                      games finish on GameArena.
                    </p>
                  )}

                  {perf?.summary && (
                    <p className="deploy-console-summary muted">{perf.summary}</p>
                  )}

                  {health === "live" && nextMatchIn != null && (
                    <p className="deploy-console-next muted">
                      {nextMatchIn > 0
                        ? `Next match in ~${nextMatchIn}s`
                        : "Proposing next match…"}
                    </p>
                  )}
                </section>

                <section className="deploy-console-section deploy-console-log-section">
                  <h2>Live log</h2>
                  {status.stats?.logTail ? (
                    <pre className="deploy-console-log">{status.stats.logTail}</pre>
                  ) : (
                    <p className="deploy-console-empty muted">
                      Log output will appear when the skill runs.
                    </p>
                  )}
                </section>

                {status.lastError && (
                  <section className="deploy-console-section deploy-console-error-section">
                    <h2>Last error</h2>
                    <pre className="deploy-console-log">{status.lastError}</pre>
                  </section>
                )}
              </div>

              <aside className="deploy-console-aside">
                {offchainPlay && (
                  <section className="deploy-console-aside-block">
                    <div className="deploy-section-head">
                      <h3>GameArena leaderboard</h3>
                      <a
                        className="deploy-section-meta muted"
                        href="https://gamearenahq.xyz/games/challenge-ai"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Full board ↗
                      </a>
                    </div>
                    {status.stats?.ladder?.error ? (
                      <p className="deploy-ladder-error muted">
                        {status.stats.ladder.error}
                      </p>
                    ) : status.stats?.ladder?.rank != null ? (
                      <>
                        <p className="muted" style={{ fontSize: "0.875rem" }}>
                          Rank #{status.stats.ladder.rank}
                          {status.stats.ladder.self?.goodAgent?.gamePassUsername
                            ? ` · ${status.stats.ladder.self.goodAgent.gamePassUsername}`
                            : ""}
                          {" · "}
                          {status.stats.ladder.points ?? 0} pts ·{" "}
                          {status.stats.ladder.wins ?? 0}W /{" "}
                          {status.stats.ladder.matches ?? 0}M
                        </p>
                        {status.stats.ladder.enrichedTop &&
                          status.stats.ladder.enrichedTop.length > 0 && (
                            <ol className="deploy-ladder-top">
                              {status.stats.ladder.enrichedTop.map((row) => (
                                <li
                                  key={row.wallet}
                                  className={
                                    row.wallet.toLowerCase() ===
                                    status.agentAddress?.toLowerCase()
                                      ? "deploy-ladder-me"
                                      : undefined
                                  }
                                >
                                  <span className="deploy-ladder-rank">
                                    #{row.rank}
                                  </span>
                                  <span className="deploy-ladder-name">
                                    {row.username ??
                                      row.goodAgent?.displayName ??
                                      `${row.wallet.slice(0, 6)}…`}
                                    {row.isGoodAgent ? " · AI" : ""}
                                  </span>
                                  <span className="deploy-ladder-pts">
                                    {row.points} pts
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                      </>
                    ) : (
                      <p className="muted" style={{ fontSize: "0.875rem" }}>
                        Play matches to appear on the GameArena board. Your agent
                        name is registered on-chain at deploy time.
                      </p>
                    )}
                  </section>
                )}

                <section className="deploy-console-aside-block">
                  <h3>Process</h3>
                  <dl className="deploy-aside-dl">
                    <div>
                      <dt>Status</dt>
                      <dd className={health === "live" ? "positive" : undefined}>
                        {HEALTH_LABEL[health]}
                      </dd>
                    </div>
                    <div>
                      <dt>Uptime</dt>
                      <dd className="tabular">
                        {formatUptime(status.pm2?.uptimeMs)}
                      </dd>
                    </div>
                    <div>
                      <dt>Memory</dt>
                      <dd className="tabular">
                        {status.pm2?.memoryMb != null
                          ? `${status.pm2.memoryMb} MB`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Restarts</dt>
                      <dd className="tabular">{status.pm2?.restarts ?? "—"}</dd>
                    </div>
                  </dl>
                </section>

                <section className="deploy-console-aside-block deploy-play-settings">
                  <h3>Play settings</h3>
                  <dl className="deploy-aside-dl">
                    {isGamearenaSkill(status?.skillId) && (
                      <>
                        <div>
                          <dt>Mode</dt>
                          <dd>{playModeLabel(playMode)}</dd>
                        </div>
                        <div>
                          <dt>Strategy</dt>
                          <dd>{strategyLabelFromConfig(config)}</dd>
                        </div>
                      </>
                    )}
                    {isBalaioSkill(status?.skillId) && (
                      <>
                        <div>
                          <dt>Roles</dt>
                          <dd>{balaioRoleSummary(config)}</dd>
                        </div>
                        {config.CREATE_TASK_ID && (
                          <div>
                            <dt>Creator task</dt>
                            <dd>
                              <code>{config.CREATE_TASK_ID}</code>
                            </dd>
                          </div>
                        )}
                      </>
                    )}
                    {offchainPlay || autoGamearena ? (
                      <>
                        <div>
                          <dt>Daily match cap</dt>
                          <dd className="tabular">
                            {config.DAILY_MATCH_CAP ?? "50"}
                          </dd>
                        </div>
                        <div>
                          <dt>Matches today</dt>
                          <dd className="tabular">{perf?.matchesToday ?? 0}</dd>
                        </div>
                        <div>
                          <dt>CELO gas</dt>
                          <dd className="tabular">
                            {formatBalance(balances?.celoFormatted, 3)}
                          </dd>
                        </div>
                      </>
                    ) : null}
                    {onchainGamearena || autoGamearena ? (
                      <>
                        <div>
                          <dt>Wager</dt>
                          <dd className="tabular">{wagerGs} G$</dd>
                        </div>
                        <div>
                          <dt>Daily loss cap</dt>
                          <dd className="tabular">
                            {config.DAILY_LOSS_CAP_GS ?? "—"} G$
                          </dd>
                        </div>
                        <div>
                          <dt>Accept timeout</dt>
                          <dd className="tabular">
                            {config.ACCEPT_TIMEOUT_SECONDS ?? "90"}s
                          </dd>
                        </div>
                        {!offchainPlay && (
                          <div>
                            <dt>Today P&amp;L</dt>
                            <dd className={`tabular${pnlClass(perf?.todayNetPnLGs)}`}>
                              {signedGs(perf?.todayNetPnLGs ?? 0)} G$
                            </dd>
                          </div>
                        )}
                        {perf && perf.gamesPlayed > 0 && !offchainPlay && (
                          <div>
                            <dt>Ledger</dt>
                            <dd className={`tabular${pnlClass(perf.netPnLGs)}`}>
                              {signedGs(perf.netPnLGs)} G$
                            </dd>
                          </div>
                        )}
                      </>
                    ) : null}
                    <div>
                      <dt>Max matches/run</dt>
                      <dd className="tabular">{config.MAX_MATCHES ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Interval</dt>
                      <dd>{humanInterval(config.MATCH_INTERVAL_SECONDS)}</dd>
                    </div>
                  </dl>
                </section>

                <details className="deploy-console-details">
                  <summary>Technical details</summary>
                  <dl className="deploy-aside-dl">
                    <div>
                      <dt>Deploy ID</dt>
                      <dd>
                        <code>{id}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Skill</dt>
                      <dd>
                        <code>{status.skillId ?? "—"}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Process name</dt>
                      <dd>
                        <code>{status.pm2Name ?? "—"}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Deployed</dt>
                      <dd>{formatWhen(status.deployedAt)}</dd>
                    </div>
                  </dl>
                </details>
              </aside>
            </div>
          </div>
        )}
      </main>

      {editingConfig &&
        (isGamearenaSkill(status?.skillId) || isBalaioSkill(status?.skillId)) && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeSettingsModal}
        >
          <div
            className="modal-panel deploy-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deploy-settings-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h2 id="deploy-settings-modal-title">
                  {isBalaioSkill(status?.skillId)
                    ? "Balaio settings"
                    : "Play settings"}
                </h2>
                <p className="muted">
                  Changes apply after you sign and the agent restarts.
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                disabled={configBusy}
                onClick={closeSettingsModal}
              >
                ×
              </button>
            </header>
            <div className="modal-body form">
              {isGamearenaSkill(status?.skillId) && (
                <GamearenaConfigFields
                  config={draftConfig}
                  onChange={(key, value) =>
                    setDraftConfig((prev) => ({ ...prev, [key]: value }))
                  }
                />
              )}
              {isBalaioSkill(status?.skillId) && (
                <BalaioConfigFields
                  config={draftConfig}
                  onChange={(key, value) =>
                    setDraftConfig((prev) => ({ ...prev, [key]: value }))
                  }
                />
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={configBusy}
                onClick={closeSettingsModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={configBusy || !isConnected}
                onClick={() => void submitConfig()}
              >
                {configBusy ? "Saving…" : "Save & restart"}
              </button>
            </footer>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
