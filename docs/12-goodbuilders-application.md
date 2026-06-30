# GoodBuilders application (draft)

Use this as a starting point for the [Flow State application](https://ubi.gd/goodbuilders).

---

## Project name

**GoodDollar Agent ID**

## Tagline

The passport-free **Proof-of-Human** layer for AI agents — let any GoodDollar-verified human vouch for their agents, backed by a required, refundable G$ bond.

---

## Summary

GoodDollar Agent ID is open-source infrastructure that lets a **GoodDollar face-verified human** cryptographically **vouch for an AI agent**, issuing a verifiable **Proof-of-Human credential** that plugs into the **ERC-8004** agent trust standard already live on Celo.

Celo's agent stack (ERC-8004 + Self Agent ID + Agent Visa) roots agent identity in **biometric passports / Aadhaar** — which excludes the hundreds of millions of document-less people GoodDollar exists to serve. We add the missing piece: a **passport-free, GoodDollar-rooted** Proof-of-Human provider. Signing is free and non-custodial; registering an agent requires a **required, refundable G$ bond** (≥ 250 G$) so **G$** has a guaranteed role, and the system stays sybil-resistant (each human can vouch for up to 10 agents). The on-ramp is a **web app where a human connects MetaMask**, face-verifies with GoodDollar, stakes the refundable bond, and signs a credential non-custodially; a public Explorer lets anyone verify an agent.

It's **additive, not competitive**: ERC-8004 handles agent identity/discovery/reputation; GoodDollar supplies the human root that Self can't give the undocumented. **A working MVP is already live** (see "What's already shipped").

---

## Problem

AI agents are exploding and the unsolved problem is **trust**: *is this agent backed by a real, unique human, or a bot farm?* Celo answers this with ERC-8004 + Self, but Self requires a **passport/Aadhaar scan**. So GoodDollar's ≈900K face-verified humans — the underbanked, Global South — are **locked out of the agent economy**. There is no passport-free way for a real human to stand behind an AI agent.

---

## Solution

| Component | Description |
|-----------|-------------|
| **Agent ID SDK + MCP** | `signAgentId` / `verifyAgentId` — GoodDollar-rooted EIP-712 agent credentials; `viem`-only SDK + MCP `gooddollar_verify_agent` tool |
| **ERC-8004 integration** | GoodDollar Proof-of-Human embedded in the ERC-8004 registration file + on-chain registry metadata; verifiable from the standard agent stack |
| **Web app (MetaMask)** | On-ramp: connect → face-verify → stake refundable bond → mint Agent ID, signed non-custodially |
| **Agent ID Explorer** | Public page to verify any agent: human-backed? root, expiry, **on-chain G$ bond** |
| **Required G$ bond** | `AgentVault` contract: a refundable G$ bond (≥ 250 G$, on-chain `minStake`) an operator locks to register an agent; revocable after a cooldown (stake-only) |

**Trust model:** Non-custodial. The human signs an EIP-712 credential in their own wallet; GoodDollar's on-chain whitelist proves a unique, real human. Verification re-reads the whitelist live, so a credential **auto-invalidates** if the human's verification lapses.

---

## G$ integration

- ✅ GoodDollar **Identity** — `getWhitelistedRoot` + face verification is the human root (core dependency); re-read **live** on every verify
- ✅ **Novel G$ utility** — `AgentVault` enforces a **required, refundable bond** (≥ 250 G$, on-chain `minStake`) per agent: guaranteed, non-zero G$ demand, not basic claim/send. The bond is a refundable deposit (payable from UBI), so it stays inclusive
- ✅ Drives **new verifications** — every agent operator must be a verified human, so onboarding grows GoodDollar's core KPI
- ✅ **ERC-8004 `IHumanProofProvider`** — a deployed, standard-conformant GoodDollar Proof-of-Human provider on Celo (`0x80c4…48c9`) that reads the live whitelist and returns a per-human nullifier, plus the proof embedded in the agent registration file / on-chain registry metadata. (Acceptance into a shared PoH registry is the next coordination step.)
- ✅ Onchain metrics for Flow State activity scoring

---

## Why this is unique (vs Season 3 + Self)

Season 3 projects were mostly **G$ utility apps** (bill pay, savings, tasks, streaming). GoodDollar Agent ID is **ecosystem identity infrastructure for the agent economy** — a different layer. Versus Self Agent ID (the existing PoH provider): we are **passport-free**, reach the **document-less**, are **G$-native**, and implement the **same ERC-8004 `IHumanProofProvider` interface** (a deployed GoodDollar provider) rather than competing with it.

---

## Target users

1. **GoodDollar-verified humans (operators)** — stand behind their agents without a passport; lock a refundable G$ bond to register them
2. **Agent builders** — drop-in passport-free Proof-of-Human for their agents
3. **Verifiers** (marketplaces, dApps, other agents) — check an agent is human-backed before trusting/paying it

---

## What's already shipped (pre-application MVP)

We didn't just plan this — the core is **built, tested, and on mainnet**:

- ✅ **Agent ID SDK** (`packages/agent-id`) — EIP-712 issue + verify with a **live** GoodDollar human-root read; `viem`-only; **13 unit tests green**. **Published to npm: [`@goodagent/agent-id`](https://www.npmjs.com/package/@goodagent/agent-id)** (`npm i @goodagent/agent-id viem`).
- ✅ **`AgentVault` smart contract** — required, refundable G$ bond with on-chain `minStake` (250 G$) enforcement (stake-only); Foundry tested (14/14); **deployed to Celo mainnet** at [`0x0409042B55e99Df8c0Feb7525A770838f3A47090`](https://celoscan.io/address/0x0409042B55e99Df8c0Feb7525A770838f3A47090).
- ✅ **ERC-8004 interop** — encode/verify the GoodDollar proof inside an ERC-8004 registration file; live reads cross-checked against Celo's Identity Registry `0x8004A169…a432`.
- ✅ **Web app** (React + Wagmi v3 + Reown AppKit) — connect MetaMask → verify gate → stake bond → issue → My Agents → Manage (stake/unstake) → **public Explorer/Verify**.
- ✅ **API + MCP** — `/agent/issue` (requires active bond ≥ `minStake` + per-human cap of 10), `/agent/verify/:address` (incl. on-chain bond + `minStake` check), `/agent/list` (by operator or human root); MCP `gooddollar_verify_agent` tool published as `@goodagent/mcp-server`.
- ✅ **Runnable SDK example** — `examples/verify-agent.mjs` issues → verifies (live Celo read) → ERC-8004 round-trip.

## Season 4 milestones

| Week | Milestone | Status |
|------|-----------|--------|
| 4 | MVP: web verify → issue EIP-712 Agent ID; `verifyAgent` API live | ✅ done early |
| 8 | Required G$ bond live (on-chain `minStake`); public Explorer; 50 agents · 100 verifications | 🔄 contract live on mainnet; growth in progress |
| 12 | ERC-8004 interop + SDK/MCP **published to npm**; 200 agents · 1+ ecosystem integration | 🔄 interop done; SDK live on npm (`@goodagent/agent-id`); integrations + growth remaining |

### Numeric targets

| Metric | Target |
|--------|--------|
| GoodDollar-rooted Agent IDs issued | 200+ |
| New verifications (operators onboarding) | 150+ |
| Third-party `verifyAgent` calls | 1,000+ |
| G$ bonded behind agents (refundable) | 250,000+ G$ |
| Ecosystem integrations | 2+ |

---

## Traction plan

- Beta with builders in the GoodDollar + Celo agent communities
- Coordinate with the **Celo ERC-8004 / Self** teams on GoodDollar as a PoH provider
- Publish SDK + MCP tutorial for Claude Desktop / Cursor / agent frameworks
- Weekly demo days + Flow State milestone updates

---

## Team

| Role | Person |
|------|--------|
| Lead / SDK / MCP / app | [Your name] |
| Smart contracts (AgentVault stake) | [TBD or solo] |
| Growth / community | [TBD or solo] |

**Skills:** TypeScript, EIP-712 / smart contracts, MCP, GoodDollar Identity SDK, ERC-8004.

---

## Why now

GoodBuilders Season 4 explicitly calls for **AI agents** and **real G$ utility**. The agent-trust race is happening on Celo *right now* (ERC-8004, Self, Agent Visa) — and it's leaving GoodDollar's document-less users behind. GoodDollar Agent ID makes GoodDollar's biggest asset — **900K verified humans without passports** — the foundation of the agent economy.

---

## Links (to add when live)

| Resource | URL |
|----------|-----|
| GitHub | `https://github.com/...` |
| Web app | [`gooddollar-agent-id.vercel.app`](https://gooddollar-agent-id.vercel.app) |
| API / verify | [`gcopilot-api.geinz.lol`](https://gcopilot-api.geinz.lol/health) |
| npm (SDK) | [`@goodagent/agent-id`](https://www.npmjs.com/package/@goodagent/agent-id) |
| Docs | `./docs/README.md` |

---

## Application checklist

- [ ] Flow State application submitted before **June 30, 2026**
- [ ] Repo link attached
- [ ] Milestones with numbers (not vague goals)
- [ ] G$ integration method explicitly stated (Identity SDK + required refundable bond)
- [ ] Join [GoodBuilders Telegram](https://ubi.gd/GoodBuildersTG)
- [ ] Plan for community voting from week 1

Program details: [ubi.gd/goodbuilders](https://ubi.gd/goodbuilders)
