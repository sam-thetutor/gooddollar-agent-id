import { Link } from "react-router-dom";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { usePageMeta } from "../lib/usePageMeta.js";
import {
  API_ORIGIN,
  DEMO_AGENT_ADDRESS,
  DEMO_AGENT_NAME,
  SITE_ORIGIN,
} from "../lib/site.js";

export function ForAgents() {
  usePageMeta(
    "For AI agents — GoodAgent",
    "Quickstart: attest your key, get vouched by a verified human, verify live on Celo. Machine-readable guides at /quickstart.md and /llms.txt.",
  );

  const demoIssueUrl = `/issue?agent=${DEMO_AGENT_ADDRESS}`;
  const demoVerifyUrl = `${API_ORIGIN}/agent/verify/${DEMO_AGENT_ADDRESS}`;

  return (
    <>
      <Nav />
      <main className="page">
        <header className="hero compact">
          <p className="eyebrow">For AI agents</p>
          <h1>Onboard in 5 steps</h1>
          <p className="lede">
            Attest your wallet → a verified human vouches → anyone can verify you
            live. Full walkthrough:{" "}
            <a href="/quickstart.md">/quickstart.md</a> · machine-readable{" "}
            <a href="/llms.txt">/llms.txt</a>.
          </p>
        </header>

        {/* QUICKSTART */}
        <section className="card" id="quickstart">
          <h2 className="card-title">Quickstart</h2>
          <ol className="numbered">
            <li>
              <strong>Create an agent wallet</strong> — one Celo address per
              agent.
            </li>
            <li>
              <strong>Attest on-chain</strong> — prove you control the key
              (section 1 below).
            </li>
            <li>
              <strong>Operator vouches</strong> — a GoodDollar-verified human
              stakes 250 G$ and signs at{" "}
              <Link to="/issue">/issue</Link>.
            </li>
            <li>
              <strong>Poll until live</strong> —{" "}
              <code>GET /agent/verify/&lt;address&gt;</code> returns{" "}
              <code>valid: true</code>.
            </li>
            <li>
              <strong>Verifiers check you</strong> — REST, SDK, or MCP (section
              2).
            </li>
          </ol>
          <p className="muted small">
            MCP one-liner for Cursor / Claude Desktop:
          </p>
          <div className="codeblock">
            <pre>{`{
  "mcpServers": {
    "gooddollar": {
      "command": "npx",
      "args": ["-y", "@goodagent/mcp-server"],
      "env": { "CELO_RPC_URL": "https://forno.celo.org" }
    }
  }
}`}</pre>
          </div>
        </section>

        {/* DEMO AGENT */}
        <section className="card" id="demo-agent">
          <h2 className="card-title">Demo agent — {DEMO_AGENT_NAME}</h2>
          <p className="muted">
            Canonical walkthrough agent. <strong>Attested on Celo mainnet</strong>{" "}
            (<code>agentProven</code> once registered). Copy this flow for your
            own agent.
          </p>
          <dl className="kv">
            <dt>Address</dt>
            <dd>
              <code>{DEMO_AGENT_ADDRESS}</code>
            </dd>
            <dt>Verify</dt>
            <dd>
              <a href={demoVerifyUrl} target="_blank" rel="noreferrer">
                {demoVerifyUrl}
              </a>
            </dd>
            <dt>Explorer</dt>
            <dd>
              <Link to={`/explore/agent/${DEMO_AGENT_ADDRESS}`}>
                Profile on {SITE_ORIGIN.replace("https://", "")}
              </Link>
            </dd>
            <dt>Operator vouch</dt>
            <dd>
              <Link to={demoIssueUrl}>Open /issue with address prefilled</Link>
            </dd>
          </dl>
          <p className="muted small">
            Operators: connect your GoodDollar-verified wallet, approve + stake
            250 G$, sign — the UI requires attestation before submit.
          </p>
        </section>

        {/* 1. REGISTER */}
        <section className="card" id="register">
          <h2 className="card-title">1 · Get registered</h2>
          <p className="muted">
            Order matters: <strong>you attest first, then a human vouches</strong>.
            Unattested addresses are rejected.
          </p>
          <ol className="numbered">
            <li>
              <strong>Attest your key on-chain</strong> (once, permanent) —
              code below.
            </li>
            <li>
              <strong>Give your address to a GoodDollar-verified human</strong>{" "}
              with ≥ 250 G$ on Celo. They stake a refundable 250 G$ bond and
              sign your credential at <Link to="/issue">/issue</Link>.
            </li>
            <li>
              <strong>Poll until you're live</strong> — code below.
            </li>
          </ol>

          <p className="muted small" style={{ marginTop: "1rem" }}>
            Attest — two ways:
          </p>
          <div className="codeblock">
            <pre>{`import { attestAsAgent, signAgentAttestation } from "@goodagent/agent-id";

// A. You hold CELO for gas — one tx, msg.sender is the proof:
await attestAsAgent(myWalletClient);

// B. No gas — sign offline, hand the result to anyone to relay:
const signed = await signAgentAttestation(myAccount);
// relayer: relayAgentAttestation(theirWalletClient, signed)`}</pre>
          </div>

          <p className="muted small">Know when you're registered:</p>
          <div className="codeblock">
            <pre>{`const url = "${API_ORIGIN}/agent/verify/0xMyAddress";
for (;;) {
  const r = await (await fetch(url)).json();
  if (r.found && r.valid) break;
  await new Promise((s) => setTimeout(s, 30_000));
}`}</pre>
          </div>
        </section>

        {/* 2. VERIFY */}
        <section className="card" id="verify">
          <h2 className="card-title">2 · Verify any agent</h2>
          <p className="muted">
            No auth. <code>valid</code> is computed live on every call: human
            root, on-chain revocation, and G$ bond.
          </p>
          <div className="codeblock">
            <pre>{`GET ${API_ORIGIN}/agent/verify/0xAGENT

{ "found": true, "valid": true, "operator": "0x…", "humanRoot": "0x…",
  "agentProven": true, "bondChecked": true, "revocationChecked": true }

// failure reasons: not_found | expired | revoked |
// operator_not_verified | human_root_mismatch | insufficient_bond`}</pre>
          </div>
          <p className="muted small">
            SDK: <code>await verifyAgentIdLive(credential)</code> from{" "}
            <a
              href="https://www.npmjs.com/package/@goodagent/agent-id"
              target="_blank"
              rel="noreferrer"
            >
              @goodagent/agent-id
            </a>
            . MCP: run{" "}
            <a
              href="https://www.npmjs.com/package/@goodagent/mcp-server"
              target="_blank"
              rel="noreferrer"
            >
              @goodagent/mcp-server
            </a>{" "}
            — tools <code>gooddollar_verify_agent</code>,{" "}
            <code>gooddollar_check_attestation</code>.
          </p>
          <p className="warn small">
            ⚠ This answers "is address X human-backed?" — not "is the party
            I'm talking to really X?". Credentials are public. For trust or
            money, use section 3.
          </p>
        </section>

        {/* 3. AUTHENTICATE */}
        <section className="card" id="authenticate">
          <h2 className="card-title">3 · Authenticate a counterparty</h2>
          <p className="muted">
            Require a fresh challenge signed by the agent's own key. One call
            checks the signature and the credential:
          </p>
          <div className="codeblock">
            <pre>{`// Agent side — sign with YOUR key:
import { buildAgentAuth, signAgentAuth } from "@goodagent/agent-id";
const wire = await signAgentAuth(
  myAccount,
  buildAgentAuth({ agent: myAddress, audience: "their-service" }),
);

// Verifier side (audience is REQUIRED and must match what the agent signed):
POST ${API_ORIGIN}/agent/verify-auth
{ "auth": { ...wire }, "audience": "their-service" }
// -> { "authenticated": true, "valid": true } only if the signature is
//    fresh (≤ 2 min), single-use (nonces can't be replayed), recovers to
//    the agent, AND the credential verifies`}</pre>
          </div>
        </section>

        {/* 4. RULES */}
        <section className="card" id="rules">
          <h2 className="card-title">The rules</h2>
          <ul className="rules-list">
            <li>
              <strong>Live, not snapshot.</strong> Every check re-reads the
              chain. If your operator's verification lapses, the bond drops
              below 250 G$, or you're revoked — you stop verifying instantly.
            </li>
            <li>
              <strong>Your operator holds the switches.</strong> They can
              withdraw the bond (un-vouch, 3-day cooldown) or revoke you
              on-chain (reversible).
            </li>
            <li>
              <strong>One human, max 10 agents.</strong>
            </li>
            <li>
              <strong>Identity only.</strong> The credential grants no spending
              power and is not a bearer token — expect counterparties to demand
              an <code>AgentAuth</code> signature (section 3).
            </li>
          </ul>
        </section>

        {/* 5. REFERENCE */}
        <section className="card" id="reference">
          <h2 className="card-title">Reference</h2>
          <dl className="kv">
            <dt>Site</dt>
            <dd>
              <a href={SITE_ORIGIN}>{SITE_ORIGIN}</a>
            </dd>
            <dt>Quickstart</dt>
            <dd>
              <a href="/quickstart.md">/quickstart.md</a>
            </dd>
            <dt>REST API</dt>
            <dd>
              <code>{API_ORIGIN}</code>
            </dd>
            <dt>Verify</dt>
            <dd>
              <code>GET /agent/verify/:address?minStake=</code>
            </dd>
            <dt>Authenticate</dt>
            <dd>
              <code>POST /agent/verify-auth</code>
            </dd>
            <dt>List</dt>
            <dd>
              <code>GET /agent/list?operator=0x…</code>
            </dd>
            <dt>AgentAttestation</dt>
            <dd>
              <code>0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2</code>
            </dd>
            <dt>AgentVault (bond)</dt>
            <dd>
              <code>0x0409042B55e99Df8c0Feb7525A770838f3A47090</code>
            </dd>
            <dt>AgentRevocation</dt>
            <dd>
              <code>0xA86a133626989115a6499b6cA67c3c8dA1662137</code>
            </dd>
            <dt>G$ token</dt>
            <dd>
              <code>0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A</code>
            </dd>
            <dt>Chain</dt>
            <dd>
              <code>Celo mainnet · chainId 42220</code>
            </dd>
            <dt>SDK / MCP</dt>
            <dd>
              <a
                href="https://www.npmjs.com/package/@goodagent/agent-id"
                target="_blank"
                rel="noreferrer"
              >
                @goodagent/agent-id
              </a>{" "}
              ·{" "}
              <a
                href="https://www.npmjs.com/package/@goodagent/mcp-server"
                target="_blank"
                rel="noreferrer"
              >
                @goodagent/mcp-server
              </a>
            </dd>
          </dl>
        </section>
      </main>
      <Footer />
    </>
  );
}
