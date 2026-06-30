# Project overview

## Project name

**GoodDollar Agent ID**

## Tagline

The **passport-free Proof-of-Human layer for AI agents** — let any GoodDollar-verified human vouch for their AI agents, backed by a required, refundable G$ bond.

---

## Problem

AI agents are multiplying fast, and the unsolved problem is **trust and accountability**: *is the agent I'm dealing with backed by a real, unique human — or a bot farm spun up a thousand times?*

Celo already has an answer stack for this — **ERC-8004** (the agent trust standard: Identity / Reputation / Validation), **Self Agent ID** (proof-of-human extension), and the **Celo Agent Visa**. But that stack roots agent identity in **biometric passports / Aadhaar** (Self requires scanning a passport chip).

**That excludes exactly the people GoodDollar exists for.** Hundreds of millions of GoodDollar's users — underbanked, Global South — **don't have a passport**. So the humans GoodDollar already verified (≈900K via face verification) are **locked out of the agent economy.**

There is no **passport-free, GoodDollar-rooted** way for a real human to prove they stand behind an AI agent.

## Solution

**GoodDollar Agent ID** lets any **GoodDollar-verified human** (face verification — no passport) cryptographically **vouch for their AI agents**, issuing a verifiable **Proof-of-Human credential** that plugs into the existing **ERC-8004** agent ecosystem.

| Component | Description |
|-----------|-------------|
| **Agent ID SDK + MCP tools** | `issueAgentId` / `verifyAgent` — issue and verify GoodDollar-rooted agent credentials in minutes |
| **ERC-8004 `IHumanProofProvider`** | A deployed, standard-conformant Proof-of-Human provider on Celo (no passport) that any `IERC8004ProofOfHuman` registry can call — reads the live GoodDollar whitelist, returns a per-human nullifier |
| **Web app (MetaMask)** | The human on-ramp: connect → face-verify → stake a refundable bond → mint an Agent ID, signed in your own wallet |
| **Agent ID Explorer** | Public page to verify any agent: human-backed? root, expiry, on-chain bond |
| **Required refundable G$ bond** | To register an agent, the operator locks a refundable G$ **bond** (≥ 250 G$) in `AgentVault` — a self-custodied deposit, revocable after a cooldown |

**Trust model:** Non-custodial. The human signs an EIP-712 identity credential in their own wallet; GoodDollar's on-chain whitelist proves the human is real and unique. Signing is free; registering an agent requires a refundable G$ bond, and a single human may vouch for at most 10 active agents. No private keys are ever held by us or the agent, and the G$ bond only moves between the operator and the vault.

---

## How it's unique (vs Self / existing Celo agent identity)

| | Self Agent ID (existing) | **GoodDollar Agent ID (this project)** |
|---|---|---|
| Human proof | Biometric **passport / Aadhaar** ZK scan | **Face verification** (GoodDollar) — **no passport** |
| Reachable users | Document-holders | The **document-less**, underbanked, Global South (GoodDollar's ≈900K) |
| Standard | ERC-8004 Proof-of-Human extension | **Same standard, same interface** — a deployed GoodDollar `IHumanProofProvider` (acceptance into shared registries is the open roadmap item) |
| Token role | — | **G$** as a required, refundable accountability bond |
| On-ramp | Self app | **Web app + MetaMask** (any wallet, via Reown AppKit) |

We are **additive, not competitive**: ERC-8004 handles agent identity/discovery/reputation; **GoodDollar supplies the passport-free human root** — the one thing Self can't do for the undocumented.

---

## Target users

| Segment | Need |
|---------|------|
| GoodDollar-verified humans (operators) | Stand behind their AI agents without a passport; lock a refundable G$ bond to register them |
| Agent builders | A drop-in, passport-free Proof-of-Human for their agents |
| Verifiers (marketplaces, dApps, other agents) | Check that an agent is backed by a real, unique human before trusting/serving/paying it |

## Goals (Season 4)

| Metric | Target |
|--------|--------|
| Agent IDs issued (GoodDollar-rooted) | 200+ |
| New GoodDollar verifications (operators onboarding) | 150+ |
| `verifyAgent` calls by third parties | 1,000+ |
| G$ bonded behind agents (refundable) | 250,000+ G$ |
| Ecosystem integrations (apps accepting GoodDollar-rooted agents) | 2+ |
| SDK + MCP published | npm + docs |

---

## Scope

### In scope (v1)
- GoodDollar Proof-of-Human reads (`getWhitelistedRoot`, expiry) via the Identity Kit
- Face-verification on-ramp (GoodDollar) from the web app
- EIP-712 **Agent ID credential** (issue + verify), GoodDollar-rooted
- **ERC-8004 Tier 1**: GoodDollar proof embedded in the agent record + verifier
- Required, refundable G$ **bond** (≥ 250 G$) per agent + per-human cap of 10 active agents
- Web app (MetaMask via Reown AppKit): on-ramp + Issue + "My Agents" management
- Public **Agent ID Explorer / verify** page
- Open **SDK + MCP tools** for issuing/verifying

### Out of scope (v1)
- Custodial keys or autonomous signing on the operator's behalf
- Agent spending budgets / delegated payments (the credential is identity-only)
- Our own forked ERC-8004 registry (Tier 3) — roadmap
- ZK passport proofs (that's Self's lane; we are the passport-free alternative)
- Multi-chain beyond Celo mainnet

---

## GoodBuilders alignment

| Requirement | How we meet it |
|-------------|----------------|
| G$ Identity SDK | Core dependency — face verification + `getWhitelistedRoot` is the human root |
| Drives identity adoption | Every agent operator must be a **verified** GoodDollar human (grows GoodDollar's core KPI) |
| Novel G$ utility | G$ as a **required, refundable agent bond** — guaranteed, non-zero demand, not basic claim/send |
| AI-agent theme | Proof-of-Human infrastructure for the agent economy; a deployed ERC-8004 `IHumanProofProvider` |
| Ecosystem infrastructure | Open SDK/MCP + verify API any team can integrate |
| Mission / inclusion | Proof-of-human for the **document-less** — GoodDollar's reason to exist |

---

## Reused foundation (already built & live)

This project repurposes infrastructure already shipped:
- **GoodDollar identity reads** (`@goodsdks/citizen-sdk`-style) in `packages/chain`
- **MCP server** (`packages/mcp-server`) + in-process agent bridge in `apps/api`
- **Web app** (`apps/web`, MetaMask via Reown AppKit)
- **Live deployment**: `https://gooddollar-agent-id.vercel.app` (app, on Vercel) · `https://gcopilot-api.geinz.lol` (API, on VPS behind nginx + PM2) · `@goodagent/agent-id` + `@goodagent/mcp-server` (on npm)

---

## Success criteria

- A GoodDollar-verified human can mint an **Agent ID** for their agent from the web app (MetaMask) in under 2 minutes — **without a passport**.
- Any developer can call `verifyAgent(address)` (MCP/REST) and get `{ valid, humanRoot, expiresAt, onchain: { stake, minStake, meetsMinStake } }` in under 10 minutes of integration.
- An agent's credential **auto-invalidates** if the human's GoodDollar verification lapses.
- Signing is free and non-custodial; registering an agent requires a refundable G$ bond (≥ 250 G$), a single human can vouch for at most 10 active agents, and the bond is revocable after a cooldown.
