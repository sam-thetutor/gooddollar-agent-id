import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAddress, isAddress, type Address } from "viem";
import { useAccount, useSignTypedData } from "wagmi";
import { Nav, ConnectButton } from "../components/Nav.js";
import {
  agentIdDomain,
  agentIdTypes,
  buildAgentIdMessage,
  messageToWire,
} from "../lib/agentId.js";
import { getWalletOverview, issueAgent } from "../lib/api.js";

const ALL_SCOPES = ["pay", "trade", "post", "vote"] as const;
const TTL_OPTIONS = [7, 30, 90, 365];

type Identity = { verified: boolean; root: string | null };

export function IssueAgent() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [agent, setAgent] = useState("");
  const [scopes, setScopes] = useState<string[]>(["pay"]);
  const [ttlDays, setTtlDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setIdentity(null);
      return;
    }
    let cancelled = false;
    getWalletOverview(address)
      .then((d) => {
        if (!cancelled)
          setIdentity({
            verified: d.verify.isWhitelisted,
            root: d.verify.root,
          });
      })
      .catch(() => !cancelled && setIdentity({ verified: false, root: null }));
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const agentValid = useMemo(() => isAddress(agent), [agent]);
  const canSubmit =
    isConnected &&
    identity?.verified &&
    identity.root &&
    agentValid &&
    scopes.length > 0 &&
    !busy;

  function toggleScope(s: string) {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  async function handleIssue() {
    if (!address || !identity?.root || !agentValid) return;
    setError(null);
    setIssued(null);
    setBusy(true);
    try {
      const message = buildAgentIdMessage({
        agent: getAddress(agent) as Address,
        operator: getAddress(address) as Address,
        humanRoot: getAddress(identity.root) as Address,
        scopes: scopes.join(","),
        ttlDays,
      });

      const signature = await signTypedDataAsync({
        domain: agentIdDomain,
        types: agentIdTypes,
        primaryType: "AgentID",
        message,
      });

      const result = await issueAgent({
        fields: messageToWire(message),
        signature,
        chainId: agentIdDomain.chainId,
        verifyingContract: agentIdDomain.verifyingContract,
      });
      setIssued(result.agent);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <Nav />
      <header className="hero compact">
        <h1>Issue an Agent ID</h1>
        <p className="lede">
          Vouch for an AI agent. You sign in your own wallet — non-custodial.
        </p>
      </header>

      {!isConnected && (
        <section className="card">
          <p className="muted">Connect your wallet to issue an Agent ID.</p>
          <ConnectButton />
        </section>
      )}

      {isConnected && identity && !identity.verified && (
        <section className="card">
          <p className="warn">You're not GoodDollar-verified yet.</p>
          <p className="muted hint">
            Issuing requires a verified human root. Verify in the GoodDollar
            wallet, then come back.
          </p>
          <a
            className="btn btn-primary"
            href="https://wallet.gooddollar.org"
            target="_blank"
            rel="noreferrer"
          >
            Verify with GoodDollar →
          </a>
        </section>
      )}

      {isConnected && identity?.verified && !issued && (
        <section className="card form">
          <label className="field">
            <span>Agent address</span>
            <input
              type="text"
              placeholder="0x… the agent's wallet address"
              value={agent}
              onChange={(e) => setAgent(e.target.value.trim())}
            />
            {agent && !agentValid && (
              <span className="error small">Not a valid address.</span>
            )}
          </label>

          <div className="field">
            <span>Scopes (what the agent may do)</span>
            <div className="chips">
              {ALL_SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip ${scopes.includes(s) ? "chip-on" : ""}`}
                  onClick={() => toggleScope(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Expires in</span>
            <select
              value={ttlDays}
              onChange={(e) => setTtlDays(Number(e.target.value))}
            >
              {TTL_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>

          <p className="muted hint">
            Stake &amp; spending budget (G$) arrive with on-chain anchoring — this
            first credential is off-chain and free to issue.
          </p>

          {error && <p className="error">{error}</p>}

          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={handleIssue}
          >
            {busy ? "Sign in your wallet…" : "Sign & issue Agent ID"}
          </button>
        </section>
      )}

      {issued && (
        <section className="card success-card">
          <h2>✓ Agent ID issued</h2>
          <p>
            Agent <code>{issued}</code> is now vouched for by your verified human
            identity.
          </p>
          <div className="actions">
            <Link to={`/verify?agent=${issued}`} className="btn btn-primary">
              View public verification
            </Link>
            <Link to="/agents" className="btn btn-ghost">
              My Agents
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
