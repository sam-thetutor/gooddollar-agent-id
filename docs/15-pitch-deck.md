# GoodDollar Agent ID — Pitch Deck

> Slide-by-slide deck. Each `---` is a new slide.
> Headline = what the audience reads; **Say** = speaker notes; keep ~1 idea per slide.

---

## Slide 1 — Title

# GoodDollar Agent ID
### The passport-free Proof-of-Human layer for AI agents

Powered by GoodDollar · Built on Celo · ERC-8004 compatible

**Say:** "We let any verified human — without a passport — vouch for their AI agents, and we make that proof readable by the agent economy already being built on Celo."

---

## Slide 2 — The world just changed

**AI agents are becoming economic actors.**
They book, pay, trade, negotiate, and represent us online.

Agents don't just *answer* anymore — they *transact*.

**Say:** "The internet is filling with autonomous agents that move money. That's the context for everything in this deck."

---

## Slide 3 — The unsolved problem

# Is this agent backed by a *real, unique human*?

Or is it one of 10,000 bots spun up by a sybil farm?

- Agents can be cloned infinitely and for free.
- There's no reliable way to know a human stands behind one.
- Without that, agent reputation, payments, and accountability collapse.

**Say:** "Trust is THE bottleneck for the agent economy. Not capability — accountability."

---

## Slide 4 — The race already started

The agent-trust stack is being built **on Celo right now**:

- **ERC-8004** — the agent trust standard (Identity / Reputation / Validation)
- **Self Agent ID** — a proof-of-human extension
- **Agent registries** — portable, on-chain agent identities

**Say:** "This isn't theoretical. The agent identity stack is being built as we speak. Good — we build on it, not against it."

---

## Slide 5 — But there's a fatal gap

# Proof-of-Human today = **passport / Aadhaar scan**

The leading approach requires scanning a biometric **passport chip**.

That excludes **hundreds of millions** of people:
the underbanked, the Global South, the document-less.

**Say:** "The current human-proof requires the one document the world's poorest don't have."

---

## Slide 6 — This is GoodDollar's exact population

GoodDollar has **≈900,000 face-verified humans** —
verified by **face**, not passport.

> The people GoodDollar already proved are real
> are **locked out of the agent economy.**

**Say:** "GoodDollar has already solved unique-human proof for exactly the people passports can't reach. That asset is sitting unused for agents."

---

## Slide 7 — Our solution

# GoodDollar Agent ID

Let any **GoodDollar face-verified human** cryptographically
**vouch for their AI agents** — no passport required —
and make that proof readable by **ERC-8004**.

**Say:** "We turn GoodDollar's verified humans into a passport-free Proof-of-Human provider for the agent economy."

---

## Slide 8 — How it works (one diagram)

```
Operator (web app + MetaMask) ──face-verify (GoodDollar)──▶ humanRoot
        │ signs EIP-712 "Agent ID" (non-custodial)
        ▼
   Agent ID credential ──embed──▶ ERC-8004 agent metadata
        ▲                                    │
   verifyAgent(addr) ◀── SDK / MCP / REST ─── Verifier
                                       (marketplace, dApp, agent)
```

**Say:** "Human verifies, signs a credential in their own wallet, the agent carries it, anyone can verify it. We never hold keys."

---

## Slide 9 — Why it's uniquely powerful

**The credential checks human-ness LIVE.**

Verification re-reads GoodDollar's whitelist on every check —
so an agent's credential **auto-invalidates** the moment
the human's verification lapses.

> A one-time passport scan can never do this.

**Say:** "This is the technical punchline. Our proof is *living*, not a stale snapshot."

---

## Slide 10 — Sybil resistance + a required, refundable G$ bond

Signing a credential is **free and non-custodial**. To *register* an agent (so it's
discoverable and verifiable), the operator locks a **refundable** G$ bond — a deposit,
not a fee:

- **Per-human cap** — one verified human can vouch for at most **10** active agents
- **Required refundable bond** — registering an agent locks a refundable bond of **≥ 250 G$** in `AgentVault`; it returns to the operator on unstake (short cooldown)
- **Verifier-chosen higher minimum** — verifiers can demand more bond than the protocol floor

**Say:** "G$ has a guaranteed, non-zero role: every registered agent is backed by a refundable bond. It's a deposit — payable from a few days of UBI and fully refundable — not a paywall, so it stays mission-aligned while giving the token real, recurring demand."

---

## Slide 11 — Why we win (vs alternatives)

| | Passport-based Proof-of-Human | **GoodDollar Agent ID** |
|---|---|---|
| Human proof | Passport / Aadhaar | **Face — no passport** |
| Reaches | Document-holders | **The document-less (≈900K)** |
| Standard | ERC-8004 | **Same standard** |
| Freshness | One-time snapshot | **Re-checked on every verify** |
| Token role | — | **Required refundable G$ bond** |
| On-ramp | Dedicated app | **Web app + MetaMask** |

**Say:** "We're additive: ERC-8004 handles agent identity, we supply the human root passports can't."

---

## Slide 12 — Why it matters

- **Inclusion:** the document-less get to participate in the agent economy — GoodDollar's whole mission. The bond is refundable and payable from UBI, not a paywall.
- **Trust:** the agent economy gets a sybil-resistant human root (per-human cap + skin-in-the-game bond).
- **Demand:** a *required* refundable G$ bond gives the token a guaranteed, non-zero accountability role — every registered agent locks G$.
- **Ecosystem:** an open SDK / MCP any team can adopt.

**Say:** "It matters because it's inclusion AND infrastructure AND new G$ demand in one product."

---

## Slide 13 — This already works (live)

Not a concept — **built, tested, and on mainnet**:

- **SDK on npm** — `@goodagent/agent-id`: identity-only EIP-712 issue + **live** GoodDollar verify; `viem`-only
- **`AgentVault` on Celo mainnet** — required, refundable G$ bond, `minStake` 250 G$ enforced on-chain · Foundry tested (14/14) · [`0x040904…7090`](https://celoscan.io/address/0x0409042B55e99Df8c0Feb7525A770838f3A47090)
- **ERC-8004 `IHumanProofProvider` on Celo mainnet** — a deployed, standard-conformant GoodDollar Proof-of-Human provider reading the live whitelist · Foundry tested (10/10) · [`0x80c4…48c9`](https://celoscan.io/address/0x80c4de6872049cb20989156bca50134c781f48c9)
- **Web app + public Explorer** — connect → verify → stake bond → issue → verify any agent

Live: `gooddollar-agent-id.vercel.app` (app) · `@goodagent/agent-id` (npm)

**Say:** "Everything here is already running — identity credential, live verify, the required on-chain G$ bond, a deployed ERC-8004 Proof-of-Human provider, and the SDK on npm."

---

## Slide 14 — Roadmap

| Stage | What |
|-------|------|
| **Shipped** | Identity-only SDK on npm · live GoodDollar verify · per-human cap · required refundable `AgentVault` bond (250 G$, on-chain `minStake`) · **deployed ERC-8004 `IHumanProofProvider`** · registration interop · web app + public Explorer |
| **Next** | Get the GoodDollar provider **accepted** into a live PoH registry (Self / 8004 coordination) so Self-stack verifiers natively recognize GoodDollar humans; first ecosystem integrations |
| **Later** | Agent reputation signals · multi-registry discovery · verifier-policy tooling |

**Say:** "GoodDollar already implements the same Proof-of-Human provider interface Self uses, and it's deployed. The next step is getting it adopted into the registries verifiers already trust."

---

## Slide 15 — Close

# Make GoodDollar the human root of the agent economy.

≈900K verified humans. Zero passports required.
One standard everyone already builds on.

**Say:** "GoodDollar Agent ID lets the world's underbanked stand behind their AI agents — and turns GoodDollar's biggest asset into agent-economy infrastructure."

---

## Appendix — One-liner & elevator pitch

**One-liner:**
GoodDollar Agent ID is the passport-free Proof-of-Human layer that lets verified humans vouch for their AI agents, backed by a required, refundable G$ bond.

**Elevator (30s):**
AI agents are becoming economic actors, and the unsolved problem is proving a real, unique human stands behind one. The leading solutions rely on passport scans — which exclude the billions GoodDollar serves. GoodDollar Agent ID uses GoodDollar's face verification to issue a Proof-of-Human credential for agents that plugs straight into ERC-8004. Signing is free and non-custodial; registering an agent locks a small, refundable G$ bond (≥ 250 G$, payable from UBI and fully refundable), so the token has a guaranteed role while the system stays inclusive and sybil-resistant (each human can vouch for up to 10 agents). We make GoodDollar's verified humans the foundation of the agent economy.

**Links:** `gooddollar-agent-id.vercel.app` · npm `@goodagent/agent-id`
