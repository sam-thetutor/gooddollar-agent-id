import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useReadContracts } from "wagmi";
import { getAddress } from "viem";
import { Nav, ConnectButton } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import {
  AGENT_ATTESTATION_ADDRESS,
  agentAttestationAbi,
} from "../lib/vault.js";
import { listAgents, type AgentListItem } from "../lib/api.js";
import { listDeploysByOwner, type DeployAgent } from "../lib/host.js";
import { deployAgentNeedsVouch, issueAgentHref } from "../lib/deploy-vouch.js";
import { usePageMeta } from "../lib/usePageMeta.js";

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
  usePageMeta(
    "My Agents — GoodAgent",
    "The AI agents you vouch for: status, bonds, and key attestations.",
  );
  const { address, isConnected } = useAccount();
  const [agents, setAgents] = useState<AgentListItem[] | null>(null);
  const [pendingDeploys, setPendingDeploys] = useState<DeployAgent[] | null>(
    null,
  );
  const [cap, setCap] = useState<{ active: number; max: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attestations = useReadContracts({
    contracts: (agents ?? []).map((a) => ({
      address: AGENT_ATTESTATION_ADDRESS,
      abi: agentAttestationAbi,
      functionName: "provenAt" as const,
      args: [getAddress(a.agent)] as const,
    })),
    query: { enabled: Boolean(agents && agents.length > 0) },
  });
  const provenByIndex = (i: number): boolean | undefined => {
    const r = attestations.data?.[i];
    if (!r || r.status !== "success") return undefined;
    return (r.result as bigint) !== 0n;
  };

  useEffect(() => {
    if (!isConnected || !address) {
      setAgents(null);
      setPendingDeploys(null);
      return;
    }
    let cancelled = false;
    Promise.all([listAgents(address), listDeploysByOwner(address)])
      .then(([issued, deploys]) => {
        if (cancelled) return;
        setAgents(issued.agents);
        setCap({ active: issued.activeCount, max: issued.maxPerHuman });
        setPendingDeploys(
          deploys.agents.filter((d) => deployAgentNeedsVouch(d)),
        );
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const hasIssued = agents && agents.length > 0;
  const hasPending = pendingDeploys && pendingDeploys.length > 0;

  return (
    <>
      <Nav />
      <main className="page">
      <header className="hero compact">
        <h1>My Agents</h1>
        <p className="lede">
          Agent IDs you've issued after vouching at /issue.
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

      {isConnected && hasPending && (
        <section className="card deploy-vouch-card">
          <h2 className="card-title">Awaiting your vouch</h2>
          <p className="muted hint">
            These hosted agents are provisioned but not in My Agents until you
            complete /issue. They appear under{" "}
            <Link to="/deployments">Deployments</Link> too.
          </p>
          <ul className="deploy-pending-vouch-list">
            {pendingDeploys.map((d) => (
              <li key={d.id}>
                <div>
                  <strong>{d.displayName}</strong>
                  {d.agentAddress && (
                    <code className="deploy-pending-agent">{d.agentAddress}</code>
                  )}
                </div>
                <div className="actions">
                  {d.agentAddress && (
                    <Link
                      className="btn btn-primary btn-sm"
                      to={issueAgentHref(d.agentAddress, d.id)}
                    >
                      Vouch at /issue
                    </Link>
                  )}
                  <Link className="btn btn-ghost btn-sm" to={`/deploy?job=${d.id}`}>
                    Deploy status
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isConnected && agents && !hasIssued && !hasPending && (
        <section className="card">
          <p className="muted">No Agent IDs yet.</p>
          <div className="actions">
            <Link to="/issue" className="btn btn-primary">
              Issue an Agent ID
            </Link>
            <Link to="/deploy" className="btn btn-ghost">
              Deploy a hosted agent
            </Link>
          </div>
        </section>
      )}

      {isConnected && hasIssued && (
        <section className="agent-grid">
          {agents.map((a, i) => (
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
                {provenByIndex(i) === false && (
                  <span className="pill pill-warn">key not attested</span>
                )}
                <span className="pill pill-muted">
                  exp {expiryLabel(a.expiresAt)}
                </span>
              </div>
              <div className="agent-card-actions">
                <Link to={`/verify?agent=${a.agent}`} className="link-sm">
                  Verify
                </Link>
                <Link to={`/manage?agent=${a.agent}`} className="link-sm">
                  Manage
                </Link>
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
