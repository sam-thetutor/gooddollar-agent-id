import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { Nav, ConnectButton } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { SITE_ORIGIN } from "../lib/site.js";
import { getWalletOverview, type WalletOverview } from "../lib/api.js";

const GOODDOLLAR_VERIFY_URL = "https://wallet.gooddollar.org";

const AGENT_PROMPT = `Read ${SITE_ORIGIN}/llms.txt and follow it to become a human-backed agent: attest your wallet key on Celo, then ask your human operator to vouch for you at ${SITE_ORIGIN}/issue`;

function AgentPromptBlock() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (http/permissions) — leave the text selectable.
    }
  };

  return (
    <div className="hero-agent">
      <p className="hero-agent-title">
        Are you an AI agent — or building one? Paste this into your agent's
        code or terminal:
      </p>
      <div className="hero-agent-row">
        <code className="hero-agent-prompt">{AGENT_PROMPT}</code>
        <button type="button" className="btn btn-primary" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="hero-agent-more muted">
        Full guide at <Link to="/for-agents">/for-agents</Link> · machine
        readable <a href="/llms.txt">/llms.txt</a>
      </p>
    </div>
  );
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: WalletOverview }
  | { kind: "error"; message: string };

export function Home() {
  const { address, isConnected } = useAccount();
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!isConnected || !address) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    getWalletOverview(address)
      .then((data) => !cancelled && setState({ kind: "ready", data }))
      .catch(
        (err: Error) =>
          !cancelled && setState({ kind: "error", message: err.message }),
      );
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const verified = state.kind === "ready" && state.data.verify.isWhitelisted;

  return (
    <>
      <Nav />

      {/* Hero — centered, single focus */}
      <section className="hero-center">
        <div className="container">
          <h1>
            Human-backed identity
            <br />
            for AI agents.
          </h1>
          <p className="lede">
            No passport. A face-verified human vouches for an agent with a
            signature and a refundable G$ bond — and anyone can verify it
            live, on-chain.
          </p>
          <div className="hero-cta">
            {isConnected ? (
              <Link to="/issue" className="btn btn-primary btn-lg">
                Issue an Agent ID
              </Link>
            ) : (
              <ConnectButton />
            )}
            <Link to="/verify" className="btn btn-ghost btn-lg">
              Verify an agent
            </Link>
          </div>

          {/* For agents — copy one prompt, agent onboards itself */}
          <AgentPromptBlock />
        </div>
      </section>

      <main className="container">
        {/* Connected wallet status */}
        {isConnected && (
          <section className="card status-card status-block">
            <h2>Your status</h2>
            {state.kind === "loading" && (
              <p className="muted">Reading your GoodDollar identity on Celo…</p>
            )}
            {state.kind === "error" && (
              <p className="error">Couldn't load: {state.message}</p>
            )}
            {state.kind === "ready" && (
              <>
                <div className="status-row">
                  <span>Identity</span>
                  <span className={verified ? "ok" : "warn"}>
                    {verified ? "Verified human" : "Not verified"}
                  </span>
                </div>
                <div className="status-row">
                  <span>G$ balance</span>
                  <span>{state.data.balance.balanceFormatted} G$</span>
                </div>
                {verified ? (
                  <div className="actions">
                    <Link to="/issue" className="btn btn-primary">
                      Issue an Agent ID
                    </Link>
                    <Link to="/agents" className="btn btn-ghost">
                      My Agents
                    </Link>
                  </div>
                ) : (
                  <div className="actions">
                    <a
                      className="btn btn-primary"
                      href={GOODDOLLAR_VERIFY_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Verify with GoodDollar
                    </a>
                    <p className="muted hint">
                      Complete face verification in the GoodDollar wallet, then
                      return here to issue an Agent ID.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* How it works — three step cards */}
        <section className="section">
          <h2 className="section-title">How it works</h2>
          <div className="steps">
            <div className="step-card">
              <span className="step-num">1</span>
              <h3>The agent consents</h3>
              <p>
                The agent proves it controls its address — one permanent
                on-chain attestation. No squatted registrations.
              </p>
            </div>
            <div className="step-card">
              <span className="step-num">2</span>
              <h3>A human vouches</h3>
              <p>
                A GoodDollar face-verified human signs the credential in their
                own wallet and locks a refundable 250 G$ bond behind the agent.
              </p>
            </div>
            <div className="step-card">
              <span className="step-num">3</span>
              <h3>Anyone verifies, live</h3>
              <p>
                Every check re-reads the chain: human status, bond, revocation.
                Nothing is a stale snapshot — pull the bond and the ID dies.
              </p>
            </div>
          </div>
        </section>

        {/* What you get — quiet two-column list */}
        <section className="section">
          <h2 className="section-title">What you get</h2>
          <dl className="deflist">
            <div>
              <dt>A live human root</dt>
              <dd>
                Re-checked against GoodDollar on every verify — the credential
                auto-invalidates the moment verification lapses.
              </dd>
            </div>
            <div>
              <dt>Skin in the game</dt>
              <dd>
                A required, refundable G$ bond stays locked for the agent's
                whole active life. Withdrawing it un-vouches the agent.
              </dd>
            </div>
            <div>
              <dt>An SDK and an MCP tool</dt>
              <dd>
                A <code>viem</code>-only TypeScript SDK plus an MCP{" "}
                <code>verify_agent</code> tool — one call from any agent
                framework.
              </dd>
            </div>
            <div>
              <dt>ERC-8004 interop</dt>
              <dd>
                The proof embeds in the standard agent registration, so the
                existing Celo agent stack reads it natively.
              </dd>
            </div>
          </dl>
        </section>

        {/* Comparison */}
        <section className="section">
          <h2 className="section-title">Why face verification</h2>
          <p className="muted block-lede">
            Passport-based proof-of-human excludes people without documents —
            exactly who GoodDollar verifies. ERC-8004 handles agent identity;
            GoodDollar supplies the human root.
          </p>
          <table className="compare">
            <thead>
              <tr>
                <th></th>
                <th>Passport-based</th>
                <th>GoodAgent</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Proof</td>
                <td>Passport / Aadhaar scan</td>
                <td className="col-us">Face — no document</td>
              </tr>
              <tr>
                <td>Reaches</td>
                <td>Document-holders</td>
                <td className="col-us">The document-less too</td>
              </tr>
              <tr>
                <td>Freshness</td>
                <td>One-time snapshot</td>
                <td className="col-us">Re-checked on every verify</td>
              </tr>
              <tr>
                <td>Token role</td>
                <td>—</td>
                <td className="col-us">Required refundable G$ bond</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>

      <Footer />
    </>
  );
}
