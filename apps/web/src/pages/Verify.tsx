import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isAddress } from "viem";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { verifyAgent, type VerifyResult } from "../lib/api.js";
import { usePageMeta } from "../lib/usePageMeta.js";

const REASON_LABEL: Record<string, string> = {
  not_found: "No Agent ID found for this address.",
  revoked: "This agent was revoked by its operator.",
  expired: "This credential has expired.",
  operator_not_verified:
    "The operator is no longer a verified GoodDollar human.",
  human_root_mismatch: "The operator's identity root no longer matches.",
  signature_mismatch: "Signature does not match the operator.",
  bad_signature: "Invalid signature.",
  insufficient_bond:
    "The required G$ bond was withdrawn. The agent becomes valid again once the operator re-stakes the minimum.",
};

type CheckState = "pass" | "fail" | "warn" | "idle";

interface Check {
  label: string;
  state: CheckState;
  detail: string;
}

const HUMAN_FAIL_REASONS = new Set([
  "expired",
  "operator_not_verified",
  "human_root_mismatch",
  "signature_mismatch",
  "bad_signature",
]);

/** Derive the four per-check verdicts from a verify response. */
function deriveChecks(r: VerifyResult): Check[] {
  const notFound = r.found === false;
  const reason = r.reason;

  let human: Check;
  if (notFound) {
    human = { label: "Human vouch", state: "idle", detail: "no credential" };
  } else if (reason && HUMAN_FAIL_REASONS.has(reason)) {
    human = { label: "Human vouch", state: "fail", detail: reason.replace(/_/g, " ") };
  } else {
    human = {
      label: "Human vouch",
      state: "pass",
      detail: "verified GoodDollar human",
    };
  }

  let bond: Check;
  if (notFound) {
    bond = { label: "G$ bond", state: "idle", detail: "—" };
  } else if (reason === "insufficient_bond") {
    bond = {
      label: "G$ bond",
      state: "fail",
      detail: r.onchain
        ? `${r.onchain.stakeFormatted} of ${r.onchain.minStakeFormatted} G$`
        : "below minimum",
    };
  } else if (r.bondChecked === false) {
    bond = { label: "G$ bond", state: "warn", detail: "couldn't read on-chain" };
  } else if (r.valid) {
    bond = {
      label: "G$ bond",
      state: r.unstakePending ? "warn" : "pass",
      detail: r.onchain
        ? `${r.onchain.stakeFormatted} G$ staked${r.unstakePending ? " — unstake pending" : ""}`
        : "meets minimum",
    };
  } else {
    bond = { label: "G$ bond", state: "idle", detail: "not evaluated" };
  }

  let revocation: Check;
  if (notFound) {
    revocation = { label: "Revocation", state: "idle", detail: "—" };
  } else if (reason === "revoked") {
    revocation = { label: "Revocation", state: "fail", detail: "revoked by operator" };
  } else if (r.valid) {
    revocation = { label: "Revocation", state: "pass", detail: "not revoked" };
  } else {
    revocation = { label: "Revocation", state: "idle", detail: "not evaluated" };
  }

  let attestation: Check;
  if (notFound) {
    attestation = { label: "Key attested", state: "idle", detail: "—" };
  } else if (r.agentProven) {
    attestation = {
      label: "Key attested",
      state: "pass",
      detail: "agent proved key ownership on-chain",
    };
  } else {
    attestation = {
      label: "Key attested",
      state: "warn",
      detail: "agent never attested its key",
    };
  }

  return [human, bond, revocation, attestation];
}

const CHECK_ICON: Record<CheckState, string> = {
  pass: "✓",
  fail: "✗",
  warn: "!",
  idle: "—",
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: VerifyResult }
  | { kind: "error"; message: string };

export function Verify() {
  usePageMeta(
    "Verify an agent — GoodAgent",
    "Check live whether an AI agent is backed by a real, currently-verified GoodDollar human on Celo.",
  );
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
  const checks = r ? deriveChecks(r) : null;

  return (
    <>
      <Nav />
      <main className="page">
        <header className="hero compact">
          <h1>Verify an agent</h1>
          <p className="lede">
            Is this AI agent backed by a real, currently-verified human?
          </p>
        </header>

        <section className="card form">
          <div className="verify-input">
            <input
              type="text"
              placeholder="0x… agent address"
              value={input}
              onChange={(e) => setInput(e.target.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setParams(input ? { agent: input } : {});
                  run(input);
                }
              }}
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

          {state.kind === "loading" && <p className="muted">Checking on Celo…</p>}
          {state.kind === "error" && <p className="error">{state.message}</p>}
        </section>

        {r && checks && (
          <section className={`verdict-panel ${valid ? "verdict-ok" : "verdict-bad"}`}>
            <div className="verdict-head">
              <span className="verdict-badge">
                {valid ? "✓ Human-backed" : "✗ Not valid"}
              </span>
              {r.agent && <code className="verdict-agent">{r.agent}</code>}
            </div>

            {!valid && r.reason && (
              <p className="verdict-reason">
                {REASON_LABEL[r.reason] ?? r.reason}
              </p>
            )}

            <div className="check-grid">
              {checks.map((c) => (
                <div key={c.label} className={`check-item check-${c.state}`}>
                  <span className="check-icon">{CHECK_ICON[c.state]}</span>
                  <div>
                    <p className="check-label">{c.label}</p>
                    <p className="check-detail">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {valid && (
              <dl className="kv verdict-kv">
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

            {valid && (
              <p className="muted small verdict-note">
                This proves a human vouches for this address — not that your
                counterparty controls it. To authenticate the party you're
                talking to, have the agent sign a fresh challenge and check it
                via <code>POST /agent/verify-auth</code>.
              </p>
            )}
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
