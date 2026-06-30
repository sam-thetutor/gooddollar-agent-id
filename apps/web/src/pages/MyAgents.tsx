import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { Nav, ConnectButton } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { listAgents, type AgentListItem } from "../lib/api.js";

function shorten(a: string): string {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

function expiryLabel(secondsStr: string): string {
  const secs = Number(secondsStr);
  if (!secs) return "—";
  const d = new Date(secs * 1000);
  return d.toLocaleDateString();
}

export function MyAgents() {
  const { address, isConnected } = useAccount();
  const [agents, setAgents] = useState<AgentListItem[] | null>(null);
  const [cap, setCap] = useState<{ active: number; max: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setAgents(null);
      return;
    }
    let cancelled = false;
    listAgents(address)
      .then((r) => {
        if (cancelled) return;
        setAgents(r.agents);
        setCap({ active: r.activeCount, max: r.maxPerHuman });
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  return (
    <>
      <Nav />
      <main className="page">
      <header className="hero compact">
        <h1>My Agents</h1>
        <p className="lede">
          Agent IDs you've issued.
          {cap && (
            <>
              {" "}
              <strong>
                {cap.active}/{cap.max}
              </strong>{" "}
              active — each verified human can vouch for up to {cap.max}.
            </>
          )}
        </p>
      </header>

      {!isConnected && (
        <section className="card">
          <p className="muted">Connect your wallet to see your agents.</p>
          <ConnectButton />
        </section>
      )}

      {isConnected && error && (
        <section className="card">
          <p className="error">{error}</p>
        </section>
      )}

      {isConnected && agents && agents.length === 0 && (
        <section className="card">
          <p className="muted">No agents yet.</p>
          <Link to="/issue" className="btn btn-primary">
            Issue your first Agent ID
          </Link>
        </section>
      )}

      {isConnected && agents && agents.length > 0 && (
        <section className="list">
          {agents.map((a) => (
            <div key={a.agent} className="card row">
              <div>
                <p className="row-title">{shorten(a.agent)}</p>
              </div>
              <div className="row-meta">
                <span className={a.revoked ? "warn" : "ok"}>
                  {a.revoked ? "revoked" : "active"}
                </span>
                <span className="muted small">
                  exp {expiryLabel(a.expiresAt)}
                </span>
                <span className="row-actions">
                  <Link to={`/verify?agent=${a.agent}`} className="link-sm">
                    Verify
                  </Link>
                  <Link to={`/manage?agent=${a.agent}`} className="link-sm">
                    Manage
                  </Link>
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
      </main>
      <Footer />
    </>
  );
}
