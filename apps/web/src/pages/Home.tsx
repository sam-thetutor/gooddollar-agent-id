import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { Nav, ConnectButton } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { SITE_ORIGIN } from "../lib/site.js";
import {
  getActivity,
  getExploreStats,
  type ActivityEvent,
  type ExploreStats,
} from "../lib/api.js";

const AGENT_PROMPT = `Read ${SITE_ORIGIN}/llms.txt and follow it to become a human-backed agent: attest your wallet key on Celo, then ask your human operator to vouch for you at ${SITE_ORIGIN}/issue`;

/* ------------------------------------------------------------------ */
/* Motion utilities (no deps)                                          */
/* ------------------------------------------------------------------ */

/** Adds .lp-in to every .lp-reveal descendant when it scrolls into view. */
function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const rootEl = ref.current;
    if (!rootEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rootEl
        .querySelectorAll(".lp-reveal")
        .forEach((n) => n.classList.add("lp-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("lp-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    rootEl.querySelectorAll(".lp-reveal").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
  return ref;
}

/** Counts from 0 to `value` the first time it becomes visible. */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return;
        started.current = true;
        const t0 = performance.now();
        const duration = 1400;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(Math.round(eased * value));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.disconnect();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <span ref={ref} className="tabular">
      {display.toLocaleString()}
    </span>
  );
}

const ROTATE_WORDS = [
  "AI agents.",
  "gaming agents.",
  "trading agents.",
  "autonomous workers.",
];

function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setLeaving(true);
      setTimeout(() => {
        setIndex((v) => (v + 1) % ROTATE_WORDS.length);
        setLeaving(false);
      }, 380);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <span className={`lp-rotate${leaving ? " lp-rotate-out" : ""}`}>
      {ROTATE_WORDS[index]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Terminal — types itself when scrolled into view                     */
/* ------------------------------------------------------------------ */

const TERMINAL_LINES = [
  "$ goodagent verify 0xBd4495…Ad2A",
  "→ credential found in registry",
  "→ human root on GoodDollar…      ✓ live",
  "→ 250 G$ bond on AgentVault…     ✓ locked",
  "→ revocation registry…           ✓ clean",
  "→ key attestation…               ✓ proven",
  "",
  '{ "valid": true, "human": "verified", "bond": "250 G$" }',
];

function VerifyTerminal() {
  const fullText = useMemo(() => TERMINAL_LINES.join("\n"), []);
  const [chars, setChars] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setChars(fullText.length);
      return;
    }
    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started) return;
        started = true;
        const t0 = performance.now();
        const tick = (t: number) => {
          const n = Math.floor((t - t0) / 16);
          setChars(Math.min(fullText.length, n));
          if (n < fullText.length) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        io.disconnect();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [fullText]);

  const done = chars >= fullText.length;

  return (
    <div className="lp-terminal lp-glass" ref={ref}>
      <div className="lp-terminal-bar">
        <span className="lp-dot lp-dot-r" />
        <span className="lp-dot lp-dot-y" />
        <span className="lp-dot lp-dot-g" />
        <span className="lp-terminal-title">live verification</span>
      </div>
      <pre className="lp-terminal-body">
        {fullText.slice(0, chars)}
        <span className={`lp-caret${done ? " lp-caret-idle" : ""}`} />
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Activity ticker                                                     */
/* ------------------------------------------------------------------ */

function shorten(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ActivityTicker({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return null;
  // Duplicate so the CSS loop is seamless.
  const loop = [...events, ...events];
  return (
    <div className="lp-marquee" aria-hidden>
      <div className="lp-marquee-track">
        {loop.map((e, i) => (
          <span key={i} className="lp-marquee-item">
            <span
              className={`lp-marquee-dot${
                e.type === "agent_id_revoked" ? " lp-marquee-dot-bad" : ""
              }`}
            />
            {e.type === "agent_id_revoked" ? "Revoked" : "Registered"}{" "}
            <code>{e.agent ? shorten(e.agent) : "—"}</code>
            <small>{timeAgo(e.at)}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agent prompt                                                        */
/* ------------------------------------------------------------------ */

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
    <div className="lp-agent lp-glass lp-reveal">
      <p className="lp-agent-title">
        Are you an AI agent? Paste this into your code or terminal:
      </p>
      <div className="lp-agent-row">
        <code className="lp-agent-prompt">{AGENT_PROMPT}</code>
        <button type="button" className="btn btn-primary" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="lp-agent-more muted">
        Full guide at <Link to="/for-agents">/for-agents</Link> · machine
        readable <a href="/llms.txt">/llms.txt</a>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function Home() {
  const { isConnected } = useAccount();
  const [stats, setStats] = useState<ExploreStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const pageRef = useScrollReveal<HTMLDivElement>();

  useEffect(() => {
    getExploreStats().then(setStats).catch(() => setStats(null));
    getActivity()
      .then((a) => setActivity(a.slice(0, 12)))
      .catch(() => setActivity([]));
  }, []);

  return (
    <div ref={pageRef}>
      <Nav />

      {/* ============ HERO ============ */}
      <section className="lp-hero">
        <div className="lp-aurora" aria-hidden>
          <span className="lp-blob lp-blob-a" />
          <span className="lp-grid" />
        </div>

        <div className="container lp-hero-inner">
          <h1 className="lp-title lp-reveal">
            Human-backed identity
            <br />
            for <RotatingWord />
          </h1>

          <p className="lp-lede lp-reveal">
            No passports. No API keys. A face-verified human vouches for an
            agent with a signature and a refundable G$ bond.
          </p>

          <div className="lp-cta lp-reveal">
            {isConnected ? (
              <Link to="/issue" className="btn btn-primary btn-lg">
                Issue an Agent ID
              </Link>
            ) : (
              <ConnectButton className="btn-lg" />
            )}
            <Link to="/verify" className="btn btn-ghost btn-lg">
              Verify an agent
            </Link>
          </div>

          {/* Live registry stats */}
          <div className="lp-stats lp-glass lp-reveal">
            <div className="lp-stat">
              <span className="lp-stat-value">
                <CountUp value={stats?.active ?? 0} />
              </span>
              <span className="lp-stat-label">active agents</span>
            </div>
            <div className="lp-stat-sep" />
            <div className="lp-stat">
              <span className="lp-stat-value">
                <CountUp value={stats?.humans ?? 0} />
              </span>
              <span className="lp-stat-label">humans vouching</span>
            </div>
            <div className="lp-stat-sep" />
            <div className="lp-stat">
              <span className="lp-stat-value">
                <CountUp
                  value={stats ? Number(stats.totalStakedFormatted) || 0 : 0}
                />
                <small> G$</small>
              </span>
              <span className="lp-stat-label">bonded on-chain</span>
            </div>
            <div className="lp-stat-sep" />
            <div className="lp-stat">
              <span className="lp-stat-value">
                <CountUp value={stats?.attested ?? 0} />
              </span>
              <span className="lp-stat-label">keys attested</span>
            </div>
          </div>

          <AgentPromptBlock />
        </div>
      </section>

      {/* Registry activity ticker */}
      <ActivityTicker events={activity} />

      <main className="container lp-main">
        {/* ============ HOW IT WORKS ============ */}
        <section className="lp-section">
          <p className="lp-eyebrow lp-reveal">How it works</p>
          <h2 className="lp-h2 lp-reveal">
            Three steps. Zero documents.
          </h2>
          <div className="lp-steps">
            <div className="lp-step lp-glass lp-card lp-reveal">
              <span className="lp-step-num">01</span>
              <h3>The agent consents</h3>
              <p>
                The agent proves it controls its address — one permanent
                on-chain attestation. No squatted registrations, ever.
              </p>
            </div>
            <div
              className="lp-step lp-glass lp-card lp-reveal"
              style={{ transitionDelay: "0.1s" }}
            >
              <span className="lp-step-num">02</span>
              <h3>A human vouches</h3>
              <p>
                A GoodDollar face-verified human signs the credential in their
                own wallet and locks a refundable 250 G$ bond behind the agent.
              </p>
            </div>
            <div
              className="lp-step lp-glass lp-card lp-reveal"
              style={{ transitionDelay: "0.2s" }}
            >
              <span className="lp-step-num">03</span>
              <h3>Anyone verifies, live</h3>
              <p>
                Every check re-reads the chain: human status, bond, revocation.
                Pull the bond and the ID dies. Nothing is a stale snapshot.
              </p>
            </div>
          </div>
        </section>

        {/* ============ BENTO FEATURES ============ */}
        <section className="lp-section">
          <p className="lp-eyebrow lp-reveal">Built different</p>
          <h2 className="lp-h2 lp-reveal">
            Identity that stays honest.
          </h2>
          <div className="lp-bento">
            <div className="lp-bento-cell lp-bento-wide lp-glass lp-card lp-reveal">
              <div className="lp-bento-glow" aria-hidden />
              <h3>A live human root</h3>
              <p>
                The credential is re-checked against GoodDollar on{" "}
                <strong>every verify</strong>. The moment the human's
                verification lapses, every credential they've signed
                auto-invalidates. No revocation ceremony needed — the truth is
                read fresh from the chain each time.
              </p>
              <code className="lp-chip">
                humanRootLookup(operator) → live ✓
              </code>
            </div>
            <div
              className="lp-bento-cell lp-glass lp-card lp-reveal"
              style={{ transitionDelay: "0.08s" }}
            >
              <h3>Skin in the game</h3>
              <p>
                A required, refundable 250 G$ bond stays locked for the agent's
                whole active life. Withdrawing it un-vouches the agent
                instantly.
              </p>
            </div>
            <div
              className="lp-bento-cell lp-glass lp-card lp-reveal"
              style={{ transitionDelay: "0.16s" }}
            >
              <h3>One call from any stack</h3>
              <p>
                A <code>viem</code>-only TypeScript SDK plus an MCP{" "}
                <code>verify_agent</code> tool — drop it into any agent
                framework.
              </p>
            </div>
            <div
              className="lp-bento-cell lp-glass lp-card lp-reveal"
              style={{ transitionDelay: "0.24s" }}
            >
              <h3>ERC-8004 native</h3>
              <p>
                The proof embeds in the standard agent registration, so the
                existing Celo agent stack reads it with zero extra work.
              </p>
            </div>
            <div
              className="lp-bento-cell lp-glass lp-card lp-reveal"
              style={{ transitionDelay: "0.32s" }}
            >
              <h3>Deploy 24/7 agents</h3>
              <p>
                Spin up hosted autonomous agents — GameArena players and more —
                supervised around the clock.
              </p>
              <Link to="/deploy" className="lp-cell-link">
                Deploy an agent →
              </Link>
            </div>
          </div>
        </section>

        {/* ============ TERMINAL ============ */}
        <section className="lp-section lp-split">
          <div className="lp-split-copy">
            <p className="lp-eyebrow lp-reveal">Verification</p>
            <h2 className="lp-h2 lp-reveal">
              Trust, resolved in
              <br />
              <span className="lp-gradient-text">one call.</span>
            </h2>
            <p className="lp-split-lede lp-reveal">
              Every verification replays the whole chain of trust — the human,
              the bond, the revocation registry, the key attestation. If any
              link breaks, <code>valid</code> flips to <code>false</code>.
              That's the entire API.
            </p>
            <div className="lp-cta lp-reveal">
              <Link to="/verify" className="btn btn-primary">
                Try it live
              </Link>
              <a
                href="https://www.npmjs.com/package/@goodagent/agent-id"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                npm SDK ↗
              </a>
            </div>
          </div>
          <div className="lp-split-demo lp-reveal">
            <VerifyTerminal />
          </div>
        </section>

        {/* ============ COMPARISON ============ */}
        <section className="lp-section">
          <p className="lp-eyebrow lp-reveal">Why face verification</p>
          <h2 className="lp-h2 lp-reveal">
            Built for the other four billion.
          </h2>
          <p className="lp-block-lede lp-reveal">
            Passport-based proof-of-human excludes people without documents —
            exactly who GoodDollar verifies. ERC-8004 handles agent identity;
            GoodDollar supplies the human root.
          </p>
          <div className="lp-compare-wrap lp-glass lp-reveal">
            <table className="lp-compare">
              <thead>
                <tr>
                  <th></th>
                  <th>Passport-based</th>
                  <th className="lp-compare-us">GoodAgent</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Proof</td>
                  <td>Passport / Aadhaar scan</td>
                  <td className="lp-compare-us">Face — no document</td>
                </tr>
                <tr>
                  <td>Reaches</td>
                  <td>Document-holders</td>
                  <td className="lp-compare-us">The document-less too</td>
                </tr>
                <tr>
                  <td>Freshness</td>
                  <td>One-time snapshot</td>
                  <td className="lp-compare-us">Re-checked on every verify</td>
                </tr>
                <tr>
                  <td>Token role</td>
                  <td>—</td>
                  <td className="lp-compare-us">Required refundable G$ bond</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="lp-section">
          <div className="lp-final lp-glass lp-reveal">
            <div className="lp-final-glow" aria-hidden />
            <h2 className="lp-final-title">
              Give your agent
              <br />
              <span className="lp-gradient-text">a human.</span>
            </h2>
            <p className="lp-final-lede">
              Attest the key, lock the bond, sign the vouch. Five minutes,
              fully on-chain.
            </p>
            <div className="lp-cta">
              <Link to="/issue" className="btn btn-primary btn-lg lp-btn-glow">
                Issue an Agent ID
              </Link>
              <Link to="/explore" className="btn btn-ghost btn-lg">
                Browse the registry
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
