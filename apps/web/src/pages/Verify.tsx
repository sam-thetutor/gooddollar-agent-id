import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isAddress } from "viem";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { verifyAgent, type VerifyResult } from "../lib/api.js";

const REASON_LABEL: Record<string, string> = {
  not_found: "No Agent ID found for this address.",
  revoked: "This credential was revoked by the operator.",
  expired: "This credential has expired.",
  operator_not_verified:
    "The operator is no longer a verified GoodDollar human.",
  human_root_mismatch: "The operator's identity root no longer matches.",
  signature_mismatch: "Signature does not match the operator.",
  bad_signature: "Invalid signature.",
  insufficient_bond:
    "The required G$ bond was withdrawn — this agent is no longer vouched for. It becomes valid again once the operator re-stakes the minimum bond.",
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: VerifyResult }
  | { kind: "error"; message: string };

export function Verify() {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("agent") ?? "");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run(address: string) {
    if (!isAddress(address)) {
      setState({ kind: "error", message: "Enter a valid 0x address." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const result = await verifyAgent(address);
      setState({ kind: "done", result });
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }

  // Auto-run when arriving with ?agent=
  useEffect(() => {
    const q = params.get("agent");
    if (q && isAddress(q)) run(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = state.kind === "done" ? state.result : null;
  const valid = r?.valid === true;

  return (
    <>
      <Nav />
      <main className="page">
      <header className="hero compact">
        <h1>Verify an agent</h1>
        <p className="lede">
          Check whether an AI agent is backed by a real, currently-verified
          GoodDollar human.
        </p>
      </header>

      <section className="card form">
        <div className="verify-input">
          <input
            type="text"
            placeholder="0x… agent address"
            value={input}
            onChange={(e) => setInput(e.target.value.trim())}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setParams(input ? { agent: input } : {});
              run(input);
            }}
          >
            Verify
          </button>
        </div>

        {state.kind === "loading" && (
          <p className="muted">Checking on Celo…</p>
        )}
        {state.kind === "error" && <p className="error">{state.message}</p>}

        {r && (
          <div className={`verdict ${valid ? "verdict-ok" : "verdict-bad"}`}>
            <div className="verdict-badge">
              {valid ? "✓ Human-backed" : "✗ Not valid"}
            </div>
            {!valid && r.reason && (
              <p className="muted">{REASON_LABEL[r.reason] ?? r.reason}</p>
            )}
            {valid && r.bondChecked === false && (
              <p className="warn small">
                ⚠ Couldn't read the on-chain bond just now — identity is
                confirmed but the bond is unverified. Try again shortly.
              </p>
            )}
            {valid && (
              <dl className="kv">
                <dt>Operator</dt>
                <dd>{r.operator}</dd>
                <dt>Human root</dt>
                <dd>{r.humanRoot}</dd>
                <dt>Expires</dt>
                <dd>
                  {r.expiresAt
                    ? new Date(Number(r.expiresAt) * 1000).toLocaleString()
                    : "—"}
                </dd>
              </dl>
            )}
            {(valid || r.reason === "insufficient_bond") && r.onchain?.vaultConfigured && (
              <div className="onchain-block">
                <p className="muted small">Accountability bond (G$)</p>
                <dl className="kv">
                  <dt>Bond staked</dt>
                  <dd>
                    {r.onchain.stakeFormatted} G${" "}
                    {r.onchain.meetsMinStake ? (
                      <span className="ok">✓ meets {r.onchain.minStakeFormatted} G$ minimum</span>
                    ) : (
                      <span className="warn">
                        below {r.onchain.minStakeFormatted} G$ minimum
                      </span>
                    )}
                  </dd>
                </dl>
                {r.unstakePending && (
                  <p className="warn small">
                    ⚠ The operator has requested an unstake — the bond may be
                    withdrawn once the cooldown ends. Re-check before relying on
                    this agent.
                  </p>
                )}
                <p className="muted small">
                  Registered agents must keep a refundable bond of at least{" "}
                  {r.onchain.minStakeFormatted} G$ locked for as long as they
                  are active — withdrawing it invalidates the Agent ID.
                  Verifiers may also require a higher minimum.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
      </main>
      <Footer />
    </>
  );
}
