import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isAddress } from "viem";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { getAgentProfile, type AgentProfile as Profile } from "../lib/api.js";
import { formatG } from "./Explore.js";

function ts(secondsStr: string | null | undefined): string {
  if (!secondsStr) return "—";
  const n = Number(secondsStr);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

function celoscan(address: string): string {
  return `https://celoscan.io/address/${address}`;
}

export function AgentProfile() {
  const { address = "" } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAddress(address)) {
      setError("Invalid agent address.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getAgentProfile(address)
      .then((p) => {
        if (!cancelled) setProfile(p);
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
  }, [address]);

  const p = profile;
  const valid = p?.verdict?.valid === true;
  const revoked =
    Boolean(p?.registration?.revokedAt) || p?.onchain?.revokedOnChain === true;

  return (
    <>
      <Nav />
      <main className="page">
        <p className="crumb">
          <Link to="/explore" className="link-sm">
            ← Explorer
          </Link>
        </p>

        {loading && (
          <section className="card">
            <p className="muted">Loading agent…</p>
          </section>
        )}

        {!loading && error && (
          <section className="card">
            <p className="error">{error}</p>
          </section>
        )}

        {!loading && p && !p.found && (
          <section className="card">
            <h1>Agent not found</h1>
            <p className="muted">
              <code className="mono">{address}</code> is not registered.
            </p>
            <div className="actions">
              <Link to={`/verify?agent=${address}`} className="btn btn-ghost">
                Run a live verify anyway
              </Link>
            </div>
          </section>
        )}

        {!loading && p && p.found && (
          <>
            <header className="profile-head">
              <div>
                <p className="eyebrow">Agent</p>
                <h1 className="mono profile-addr">{p.agent}</h1>
              </div>
              <div className="agent-card-pills">
                <span className={`pill ${revoked ? "pill-bad" : valid ? "pill-ok" : "pill-warn"}`}>
                  {revoked ? "revoked" : valid ? "valid" : (p.verdict?.reason ?? "invalid").replace(/_/g, " ")}
                </span>
                {p.onchain.agentProven ? (
                  <span className="pill pill-ok">key attested</span>
                ) : (
                  <span className="pill pill-warn">key not attested</span>
                )}
                {p.onchain.vault && (
                  <span className="pill pill-muted">
                    {formatG(p.onchain.vault.stake)} bonded
                  </span>
                )}
              </div>
            </header>

            <section className="card">
              <h2 className="card-title">Registration</h2>
              <dl className="kv">
                <dt>Operator</dt>
                <dd>
                  <a
                    href={celoscan(p.registration.operator)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.registration.operator} ↗
                  </a>
                </dd>
                <dt>Human root</dt>
                <dd>{p.registration.humanRoot}</dd>
                <dt>Registered</dt>
                <dd>{new Date(p.registration.createdAt).toLocaleString()}</dd>
                <dt>Issued</dt>
                <dd>{ts(p.registration.issuedAt)}</dd>
                <dt>Expires</dt>
                <dd>{ts(p.registration.expiresAt)}</dd>
                <dt>Nonce</dt>
                <dd>{p.registration.nonce}</dd>
                {p.registration.revokedAt && (
                  <>
                    <dt>Revoked</dt>
                    <dd className="warn">
                      {new Date(p.registration.revokedAt).toLocaleString()}
                    </dd>
                  </>
                )}
              </dl>
            </section>

            <section className="card">
              <h2 className="card-title">On-chain</h2>
              <dl className="kv">
                <dt>G$ bond</dt>
                <dd>
                  {p.onchain.vault
                    ? `${p.onchain.vault.stakeFormatted} G$ (min ${p.onchain.vault.minStakeFormatted})`
                    : "unreadable"}
                  {p.onchain.vault?.unstakeUnlockAt && (
                    <span className="warn">
                      {" "}
                      — unstake requested, unlocks{" "}
                      {new Date(p.onchain.vault.unstakeUnlockAt).toLocaleString()}
                    </span>
                  )}
                </dd>
                <dt>Bond owner</dt>
                <dd>{p.onchain.vault?.operator ?? "—"}</dd>
                <dt>Key attested</dt>
                <dd>
                  {p.onchain.agentProven ? (
                    <span className="ok">✓ {ts(p.onchain.agentProvenAt)}</span>
                  ) : (
                    <span className="warn">never</span>
                  )}
                </dd>
                <dt>Revocation registry</dt>
                <dd>
                  {p.onchain.revokedOnChain === null
                    ? "unreadable"
                    : p.onchain.revokedOnChain
                      ? "revoked"
                      : "not revoked"}
                </dd>
                <dt>Agent on Celoscan</dt>
                <dd>
                  <a href={celoscan(p.agent)} target="_blank" rel="noreferrer">
                    {p.agent} ↗
                  </a>
                </dd>
              </dl>
            </section>

            <div className="actions">
              <Link to={`/verify?agent=${p.agent}`} className="btn btn-primary">
                Run live verification
              </Link>
              <Link to={`/manage?agent=${p.agent}`} className="btn btn-ghost">
                Manage (operator)
              </Link>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
