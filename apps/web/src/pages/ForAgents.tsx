import { Link } from "react-router-dom";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";

const API_BASE = "https://gcopilot-api.geinz.lol";

export function ForAgents() {
  return (
    <>
      <Nav />
      <main className="page">
        <header className="hero compact">
          <p className="eyebrow">If you are an AI agent, read this</p>
          <h1>Prove a human stands behind you</h1>
          <p className="lede">
            GoodAgent gives you a <strong>Proof-of-Human credential</strong>: a
            cryptographic statement that a real, face-verified GoodDollar human
            vouches for you — no passport involved. Marketplaces, dApps, and
            other agents can check it in one call before trusting or paying you.
          </p>
        </header>

        <section className="card">
          <h2 className="card-title">Machine-readable version</h2>
          <p className="muted">
            Everything on this page is also served as plain text at{" "}
            <a href="/llms.txt">/llms.txt</a> — fetch it and follow the
            instructions directly.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">1. Check whether you are registered</h2>
          <p className="muted">
            Anyone can query the public verify endpoint with your address — no
            key, no auth:
          </p>
          <div className="codeblock">
            <pre>{`GET ${API_BASE}/agent/verify/0xYOUR_AGENT_ADDRESS

// registered + backed:
{ "found": true, "valid": true, "operator": "0x…", "humanRoot": "0x…",
  "expiresAt": "…", "onchain": { "stake": "…", "minStake": "…" } }

// not registered:
{ "found": false, "valid": false, "reason": "not_found" }`}</pre>
          </div>
          <p className="muted small">
            <code>valid</code> is live: it re-checks the operator's GoodDollar
            verification <em>and</em> the on-chain G$ bond on every call. If the
            bond was withdrawn you'll see{" "}
            <code>reason: "insufficient_bond"</code>.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">2. How to get registered</h2>
          <p className="muted">
            You cannot register yourself — that's the point. A{" "}
            <strong>human operator</strong> must vouch for you, and everything
            is signed in <em>their</em> wallet (you never hold their keys):
          </p>
          <ol className="numbered">
            <li>
              <strong>Find your operator.</strong> They need a GoodDollar
              face-verified wallet (free at{" "}
              <a
                href="https://wallet.gooddollar.org"
                target="_blank"
                rel="noreferrer"
              >
                wallet.gooddollar.org
              </a>
              ) and at least 250 G$.
            </li>
            <li>
              <strong>Send them to the Issue page.</strong> Point them at{" "}
              <Link to="/issue">/issue</Link> with your agent address (the
              address you sign/act with).
            </li>
            <li>
              <strong>They stake the bond.</strong> A refundable bond of ≥ 250
              G$ is locked in the AgentVault on Celo behind your address. It
              always returns to them; it is never spent.
            </li>
            <li>
              <strong>They sign your Agent ID.</strong> An EIP-712 credential
              binding their human root to your address, valid up to 1 year.
            </li>
            <li>
              <strong>Carry your credential.</strong> Store the signed
              credential and present it to counterparties, or let them look you
              up by address via the API. You can also embed it in your ERC-8004
              registration file so the whole Celo agent stack can read it.
            </li>
          </ol>
        </section>

        <section className="card">
          <h2 className="card-title">
            3. How to know you've been vouched for
          </h2>
          <p className="muted">
            You don't need your human to tell you — poll the public verify
            endpoint until your address turns up valid:
          </p>
          <div className="codeblock">
            <pre>{`// poll until found && valid — then you are human-backed
const url = "${API_BASE}/agent/verify/0xMyAddress";
for (;;) {
  const r = await (await fetch(url)).json();
  if (r.found && r.valid) break;   // vouched for + bonded
  await new Promise((s) => setTimeout(s, 30_000));
}`}</pre>
          </div>
          <p className="muted small">
            Trustless alternatives: watch the AgentVault's{" "}
            <code>Staked</code> event for your address on Celo (the bond lands
            a moment before the credential is issued, so confirm via the API
            afterwards), or — if your operator anchored the credential in your
            ERC-8004 registration — read your own registry metadata under{" "}
            <code>gooddollar-proof-of-human</code>.
          </p>
          <p className="muted small">
            Note: the verify endpoint proves you're vouched for but doesn't
            return the signed credential itself. If you want to carry and
            present the credential (offline verification, ERC-8004 embedding),
            ask your operator for the credential JSON after they sign it.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">4. The rules you live under</h2>
          <dl className="deflist">
            <div>
              <dt>Your validity is live, not a snapshot</dt>
              <dd>
                Every verification re-reads your operator's GoodDollar status
                and your G$ bond on-chain. If either lapses, you stop verifying
                immediately.
              </dd>
            </div>
            <div>
              <dt>The bond must stay locked</dt>
              <dd>
                If your operator withdraws the bond below 250 G$ (3-day
                cooldown), you fail verification with{" "}
                <code>insufficient_bond</code> until it's re-staked. Withdrawing
                the bond is how an operator un-vouches you.
              </dd>
            </div>
            <div>
              <dt>One human, max 10 agents</dt>
              <dd>
                Your operator can vouch for at most 10 active agents at a time.
              </dd>
            </div>
            <div>
              <dt>Non-custodial, identity-only</dt>
              <dd>
                Your credential carries no money fields and grants no spending
                power. It proves exactly one thing: a verified human stands
                behind you.
              </dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <h2 className="card-title">5. Verify other agents</h2>
          <p className="muted">
            Before trusting or paying another agent, check it's human-backed.
            Three ways:
          </p>
          <p className="muted small">
            <strong>TypeScript SDK</strong> —{" "}
            <a
              href="https://www.npmjs.com/package/@goodagent/agent-id"
              target="_blank"
              rel="noreferrer"
            >
              @goodagent/agent-id
            </a>{" "}
            (viem-only):
          </p>
          <div className="codeblock">
            <pre>{`import {
  verifyAgentId, liveHumanRootLookup, liveStakeLookup,
} from "@goodagent/agent-id";

const { valid, reason } = await verifyAgentId(credential, {
  humanRootLookup: liveHumanRootLookup, // live GoodDollar check
  stakeLookup: liveStakeLookup,         // live G$ bond check
});`}</pre>
          </div>
          <p className="muted small">
            <strong>MCP tool</strong> — add{" "}
            <a
              href="https://www.npmjs.com/package/@goodagent/mcp-server"
              target="_blank"
              rel="noreferrer"
            >
              @goodagent/mcp-server
            </a>{" "}
            to your runtime and call <code>gooddollar_verify_agent</code>:
          </p>
          <div className="codeblock">
            <pre>{`{
  "mcpServers": {
    "gooddollar": {
      "command": "npx",
      "args": ["-y", "@goodagent/mcp-server"]
    }
  }
}`}</pre>
          </div>
          <p className="muted small">
            <strong>REST</strong> — <code>{API_BASE}/agent/verify/:address</code>{" "}
            (add <code>?minStake=</code> to require a higher bond than the 250
            G$ floor), or use the <Link to="/verify">Explorer</Link> in a
            browser.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">Addresses &amp; endpoints</h2>
          <dl className="kv">
            <dt>REST API</dt>
            <dd>
              <code>{API_BASE}</code>
            </dd>
            <dt>AgentVault (Celo)</dt>
            <dd>
              <code>0x0409042B55e99Df8c0Feb7525A770838f3A47090</code>
            </dd>
            <dt>Proof provider (ERC-8004)</dt>
            <dd>
              <code>0x80c4de6872049cb20989156bca50134c781f48c9</code>
            </dd>
            <dt>Chain</dt>
            <dd>Celo mainnet (42220)</dd>
          </dl>
        </section>
      </main>
      <Footer />
    </>
  );
}
