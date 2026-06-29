# GoodBuilders application (draft)

Use this as a starting point for the [Flow State application](https://ubi.gd/goodbuilders).

---

## Project name

**GoodDollar Agent ID**

## Tagline

The passport-free **Proof-of-Human** layer for AI agents — let any GoodDollar-verified human vouch for their agents, with G$ as the agent's stake and spending budget.

---

## Summary

GoodDollar Agent ID is open-source infrastructure that lets a **GoodDollar face-verified human** cryptographically **vouch for an AI agent**, issuing a verifiable **Proof-of-Human credential** that plugs into the **ERC-8004** agent trust standard already live on Celo.

Celo's agent stack (ERC-8004 + Self Agent ID + Agent Visa) roots agent identity in **biometric passports / Aadhaar** — which excludes the hundreds of millions of document-less people GoodDollar exists to serve. We add the missing piece: a **passport-free, GoodDollar-rooted** Proof-of-Human provider, with **G$** as the agent's accountability stake and a capped, delegated spending budget. The on-ramp is a MiniPay copilot; a public Explorer lets anyone verify an agent.

It's **additive, not competitive**: ERC-8004 handles agent identity/discovery/reputation; GoodDollar supplies the human root that Self can't give the undocumented.

---

## Problem

AI agents are exploding and the unsolved problem is **trust**: *is this agent backed by a real, unique human, or a bot farm?* Celo answers this with ERC-8004 + Self, but Self requires a **passport/Aadhaar scan**. So GoodDollar's ≈900K face-verified humans — the underbanked, Global South — are **locked out of the agent economy**. There is no passport-free way for a real human to stand behind an AI agent.

---

## Solution

| Component | Description |
|-----------|-------------|
| **Agent ID SDK + MCP** | `issueAgentId` / `verifyAgent` — GoodDollar-rooted EIP-712 agent credentials |
| **ERC-8004 integration** | GoodDollar as an alternative Proof-of-Human provider (Tier 1 metadata attestation in v1) |
| **MiniPay copilot** | On-ramp: face-verify → mint Agent ID → manage stake/budget, signed non-custodially |
| **Agent ID Explorer** | Public page to verify any agent: human-backed? root, stake, scopes, expiry |
| **G$ as agent money** | G$ stake/bond for accountability + capped, revocable delegated budget |

**Trust model:** Non-custodial. The human signs an EIP-712 credential in their own wallet; GoodDollar's on-chain whitelist proves a unique, real human. Verification re-reads the whitelist live, so a credential **auto-invalidates** if the human's verification lapses.

---

## G$ integration

- ✅ GoodDollar **Identity SDK** — `getWhitelistedRoot` + face verification (`generateFVLink`) is the human root (core dependency)
- ✅ **Novel G$ utility** — G$ **stake/bond** per agent + **delegated, capped spending budget** (new demand, not basic claim/send)
- ✅ Drives **new verifications** — the copilot's job is to get people verified (grows GoodDollar's core KPI)
- ✅ **ERC-8004 interoperable** — GoodDollar proof embedded in the agent record/metadata
- ✅ Onchain metrics for Flow State activity scoring

---

## Why this is unique (vs Season 3 + Self)

Season 3 projects were mostly **G$ utility apps** (bill pay, savings, tasks, streaming). GoodDollar Agent ID is **ecosystem identity infrastructure for the agent economy** — a different layer. Versus Self Agent ID (the existing PoH provider): we are **passport-free**, reach the **document-less**, are **G$-native**, and use the **same ERC-8004 standard** rather than competing with it.

---

## Target users

1. **GoodDollar-verified humans (operators)** — stand behind their agents without a passport; cap agent spend
2. **Agent builders** — drop-in passport-free Proof-of-Human for their agents
3. **Verifiers** (marketplaces, dApps, other agents) — check an agent is human-backed before trusting/paying it

---

## Season 4 milestones

| Week | Milestone |
|------|-----------|
| 4 | MVP: MiniPay verify → issue EIP-712 Agent ID; `verifyAgent` API live |
| 8 | G$ stake + delegated budget live; public Explorer; 50 agents · 100 verifications |
| 12 | ERC-8004 Tier 1 attestation; SDK + MCP on npm; 200 agents · 1 ecosystem integration |

### Numeric targets

| Metric | Target |
|--------|--------|
| GoodDollar-rooted Agent IDs issued | 200+ |
| New verifications driven via copilot | 150+ |
| Third-party `verifyAgent` calls | 1,000+ |
| G$ staked / moved through agent budgets | 250,000+ G$ |
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
| Smart contracts (stake/budget/attestation) | [TBD or solo] |
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
| Mini App (MiniPay) | `https://gcopilot.geinz.lol` |
| API / verify | `https://gcopilot-api.geinz.lol` |
| npm (SDK + MCP) | `https://npmjs.com/package/...` |
| Docs | `./docs/README.md` |

---

## Application checklist

- [ ] Flow State application submitted before **June 30, 2026**
- [ ] Repo link attached
- [ ] Milestones with numbers (not vague goals)
- [ ] G$ integration method explicitly stated (Identity SDK + stake/budget)
- [ ] Join [GoodBuilders Telegram](https://ubi.gd/GoodBuildersTG)
- [ ] Plan for community voting from week 1

Program details: [ubi.gd/goodbuilders](https://ubi.gd/goodbuilders)
