import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { Nav, ConnectButton } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { getWalletOverview, type WalletOverview } from "../lib/api.js";

const GOODDOLLAR_VERIFY_URL = "https://wallet.gooddollar.org";

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

      {/* Hero */}
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1>Proof-of-Human for AI agents, without a passport.</h1>
            <p className="lede">
              GoodAgent lets any face-verified human vouch for their AI agents.
              You sign a credential in your own wallet and lock a small,
              refundable G$ bond; anyone can check the agent is human-backed.
            </p>
            <div className="hero-cta">
              {isConnected ? (
                <Link to="/issue" className="btn btn-primary">
                  Issue an Agent ID
                </Link>
              ) : (
                <ConnectButton />
              )}
              <Link to="/verify" className="btn btn-ghost">
                Verify an agent
              </Link>
            </div>
            <p className="muted hero-note">
              Non-custodial · ERC-8004 compatible · AgentVault live on Celo
              mainnet
            </p>
          </div>

          <div className="hero-code">
            <div className="code-window">
              <div className="code-bar">verify.ts</div>
              <pre>
                <span className="c-key">import</span>
                {" { verifyAgentId } "}
                <span className="c-key">from</span>
                {' "@goodagent/agent-id";'}
                {"\n\n"}
                <span className="c-key">const</span>
                {" { valid, operator } ="}
                {"\n  "}
                <span className="c-key">await</span>
                {" verifyAgentId(credential);"}
                {"\n\n"}
                <span className="c-com">{"// valid only if a real"}</span>
                {"\n"}
                <span className="c-com">{"// human still backs it"}</span>
              </pre>
            </div>
          </div>
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

        {/* How it works */}
        <section className="block">
          <h2>How it works</h2>
          <ol className="numbered">
            <li>
              <strong>Verify once.</strong> Prove you're a real, unique human
              with GoodDollar face verification — no passport, no document scan.
            </li>
            <li>
              <strong>Vouch for your agent.</strong> Sign an EIP-712 credential
              in your own wallet that binds your human root to the agent's
              address.
            </li>
            <li>
              <strong>Anyone can verify.</strong> Counterparties check the agent
              is human-backed. The check re-reads your GoodDollar status live, so
              it stops being valid if your verification lapses.
            </li>
          </ol>
        </section>

        {/* What it gives you */}
        <section className="block">
          <h2>What it gives you</h2>
          <dl className="deflist">
            <div>
              <dt>A live human root</dt>
              <dd>
                The credential is re-checked against GoodDollar on every verify
                — not a one-time snapshot that goes stale.
              </dd>
            </div>
            <div>
              <dt>An SDK and an MCP tool</dt>
              <dd>
                A <code>viem</code>-only TypeScript SDK and an MCP{" "}
                <code>verify_agent</code> tool, so agent frameworks can check an
                agent in one call.
              </dd>
            </div>
            <div>
              <dt>ERC-8004 interop</dt>
              <dd>
                The GoodDollar proof embeds in the standard agent registration,
                so the existing Celo agent stack can read it.
              </dd>
            </div>
            <div>
              <dt>Required refundable G$ bond</dt>
              <dd>
                Registering an agent locks a refundable G$ bond (≥ 250 G$) in the
                AgentVault on Celo as accountability — fully refundable, revocable
                after a cooldown.
              </dd>
            </div>
          </dl>
        </section>

        {/* For agents */}
        <section className="card status-card status-block">
          <h2>Are you an AI agent?</h2>
          <p className="muted">
            There's a page written for you: how to check your registration, how
            to get a human to vouch for you, and how to verify other agents —
            plus a machine-readable <a href="/llms.txt">/llms.txt</a>.
          </p>
          <div className="actions">
            <Link to="/for-agents" className="btn btn-primary">
              If you are an agent, read this
            </Link>
          </div>
        </section>

        {/* Comparison */}
        <section className="block">
          <h2>Why face verification</h2>
          <p className="muted block-lede">
            Passport-based proof-of-human excludes people without documents —
            exactly who GoodDollar verifies. This is additive: ERC-8004 handles
            agent identity, GoodDollar supplies the human root.
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
