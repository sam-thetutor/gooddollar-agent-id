# GoodDollar Agent ID — Pitch Deck

> Slide-by-slide deck for GoodBuilders Season 4. Each `---` is a new slide.
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

By 2026, agents don't just *answer* — they *transact*.

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

## Slide 4 — Celo already started solving it

The agent-trust race is happening **on Celo right now**:

- **ERC-8004** — the agent trust standard (Identity / Reputation / Validation)
- **Self Agent ID** — proof-of-human extension
- **Celo Agent Visa** — passport for agents

**Say:** "This isn't theoretical. Celo is building the agent identity stack as we speak. Good — we build on it, not against it."

---

## Slide 5 — But there's a fatal gap

# Proof-of-Human today = **passport / Aadhaar scan**

Self requires scanning a biometric **passport chip**.

That excludes **hundreds of millions** of people:
the underbanked, the Global South, the document-less.

**Say:** "The current human-proof requires the one document the world's poorest don't have."

---

## Slide 6 — This is GoodDollar's exact population

GoodDollar has **≈900,000 face-verified humans** —
verified by **face**, not passport.

> The people GoodDollar already proved are real
> are **locked out of the agent economy.**

**Say:** "GoodDollar has already solved unique-human proof for exactly the people Self can't reach. That asset is sitting unused for agents."

---

## Slide 7 — Our solution

# GoodDollar Agent ID

Let any **GoodDollar face-verified human** cryptographically
**vouch for their AI agents** — no passport required —
and make that proof readable by **ERC-8004**.

**Say:** "We turn GoodDollar's 900K verified humans into a passport-free Proof-of-Human provider for the agent economy."

---

## Slide 8 — How it works (one diagram)

```
Operator (MiniPay) ──face-verify (GoodDollar)──▶ humanRoot
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

## Slide 10 — G$ becomes agent money

Novel utility — not basic claim/send:

- **Stake / bond** — operator locks G$ behind an agent (skin in the game)
- **Delegated budget** — agent spends only within a **capped, revocable** G$ allowance
- **Pay-per-verify** (optional) — sustainable infra economics

**Say:** "G$ isn't a wrapper here — it's the accountability collateral and the spending rail for agents."

---

## Slide 11 — Why we win (vs alternatives)

| | Self Agent ID | **GoodDollar Agent ID** |
|---|---|---|
| Human proof | Passport / Aadhaar | **Face — no passport** |
| Reaches | Document-holders | **The document-less (900K)** |
| Standard | ERC-8004 | **Same standard** |
| Token role | — | **G$ stake + budget** |
| On-ramp | Self app | **MiniPay** |

**Say:** "We're additive: ERC-8004 handles agent identity, we supply the human root Self can't."

---

## Slide 12 — Why it matters

- **Inclusion:** the document-less get to participate in the agent economy — GoodDollar's whole mission.
- **Trust:** the agent economy gets a sybil-resistant human root.
- **Demand:** real, recurring G$ utility (stake + budgets) tied to agents.
- **Ecosystem:** open SDK/MCP any Celo team can adopt.

**Say:** "It matters because it's inclusion AND infrastructure AND new G$ demand in one product."

---

## Slide 13 — Traction & what's already built

Reusing live infrastructure (pivoted from G$ Copilot):

- GoodDollar identity reads · MCP server · MiniPay app + self-hosted AI copilot
- Live: `gcopilot.geinz.lol` (app) · `gcopilot-api.geinz.lol` (API)

**Say:** "We're not starting from zero — the on-ramp, identity reads, and deploy are already running."

---

## Slide 14 — Roadmap (12 weeks)

| Week | Milestone |
|------|-----------|
| 4 | Verify → issue EIP-712 Agent ID; `verifyAgent` API live |
| 8 | G$ stake + budget; public Explorer; 50 agents · 100 verifications |
| 12 | ERC-8004 Tier 1 attestation; SDK + MCP on npm; 200 agents |

**Targets:** 200+ Agent IDs · 150+ new verifications · 1,000+ verify calls · 250K+ G$ · 2+ integrations

**Say:** "A demoable product by week 4, ecosystem-ready by week 12."

---

## Slide 15 — The ask / close

# Make GoodDollar the human root of the agent economy.

900K verified humans. Zero passports required.
One standard everyone already builds on.

**GoodDollar Agent ID** — built for GoodBuilders Season 4.

**Say:** "Fund the layer that lets the world's underbanked stand behind their AI agents — and turns GoodDollar's biggest asset into agent-economy infrastructure."

---

## Appendix — One-liner & elevator pitch

**One-liner:**
GoodDollar Agent ID is the passport-free Proof-of-Human layer that lets verified humans vouch for their AI agents, with G$ as the stake and budget.

**Elevator (30s):**
AI agents are becoming economic actors, and the unsolved problem is proving a real, unique human stands behind one. Celo's stack solves this with passport scans — which excludes the billions GoodDollar serves. GoodDollar Agent ID uses GoodDollar's face verification to issue a Proof-of-Human credential for agents that plugs straight into ERC-8004, with G$ as the agent's accountability stake and spending budget. We make GoodDollar's 900K verified humans the foundation of the agent economy.
