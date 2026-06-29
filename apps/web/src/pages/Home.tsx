import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { Nav, ConnectButton } from "../components/Nav.js";
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

  const verified =
    state.kind === "ready" && state.data.verify.isWhitelisted;

  return (
    <div className="page">
      <Nav />

      <header className="hero">
        <p className="eyebrow">GoodBuilders S4 · Built on Celo</p>
        <h1>
          The passport-free <span className="grad">Proof-of-Human</span> layer
          for AI agents
        </h1>
        <p className="lede">
          Let any GoodDollar-verified human vouch for their AI agents — issuing a
          verifiable credential that plugs into ERC-8004, with G$ as the agent's
          stake and budget.
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
      </header>

      {isConnected && (
        <section className="card status-card">
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
                  {verified ? "✓ Verified human" : "✗ Not verified"}
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
                    Verify with GoodDollar →
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

      <section className="steps">
        <div className="step">
          <span className="step-n">1</span>
          <h3>Verify once</h3>
          <p>Prove you're a real, unique human with GoodDollar — no passport.</p>
        </div>
        <div className="step">
          <span className="step-n">2</span>
          <h3>Vouch for your agent</h3>
          <p>Sign an EIP-712 credential in your own wallet. Non-custodial.</p>
        </div>
        <div className="step">
          <span className="step-n">3</span>
          <h3>Anyone can verify</h3>
          <p>
            Counterparties check your agent is human-backed — live, and it
            auto-expires if your verification lapses.
          </p>
        </div>
      </section>

      <footer className="foot">
        <Link to="/chat" className="muted">
          Ask the Copilot
        </Link>
      </footer>
    </div>
  );
}
