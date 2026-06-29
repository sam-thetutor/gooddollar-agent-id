# GoodDollar Agent ID

The passport-free **Proof-of-Human layer for AI agents** — powered by [GoodDollar](https://gooddollar.org) on Celo. Built for [GoodBuilders Season 4](https://ubi.gd/goodbuilders).

## What it is

**GoodDollar Agent ID** lets any GoodDollar **face-verified human** cryptographically vouch for their AI agents — issuing a verifiable **Proof-of-Human credential** that plugs into the **ERC-8004** agent trust standard on Celo, with **G$** as the agent's accountability stake and capped spending budget.

- **Agent ID SDK + MCP** — `issueAgentId` / `verifyAgent`: GoodDollar-rooted EIP-712 agent credentials any agent or app can use.
- **MiniPay copilot** — the human on-ramp: face-verify → mint an Agent ID → manage stake/budget, all signed non-custodially.
- **Public Explorer** — verify any agent: human-backed? root, scopes, stake, expiry.

The LLM and the agent never hold the operator's keys. The human signs in their own wallet; agents spend only within a capped, revocable G$ budget.

## The problem it solves

Celo's agent stack (ERC-8004 + Self Agent ID + Agent Visa) roots agent identity in **biometric passports / Aadhaar** — excluding the hundreds of millions of document-less people GoodDollar serves. So GoodDollar's ≈900K face-verified humans are **locked out of the agent economy**.

GoodDollar Agent ID adds the missing piece: a **passport-free, GoodDollar-rooted** Proof-of-Human provider that the *same* ERC-8004 standard can consume — additive, not competitive.

## Who it's for

| Segment | What they get |
|---------|---------------|
| GoodDollar-verified humans (operators) | Stand behind their agents without a passport; cap agent spend |
| Agent builders | Drop-in passport-free Proof-of-Human for their agents |
| Verifiers (marketplaces, dApps, agents) | Check an agent is human-backed before trusting/paying it |

## How it works

```
Operator (MiniPay) ──verify (GoodDollar face)──▶ humanRoot
        │ sign EIP-712 AgentID (non-custodial)
        ▼
   Agent ID credential ──embed──▶ ERC-8004 agent metadata
        ▲                                   │
   verifyAgent(addr) ◀── SDK / MCP / REST ── Verifier
```

## Status

**GoodDollar Agent ID** — credential core + API/MCP + website are in place:

- **Phase A** ✅ `packages/agent-id` — EIP-712 sign/verify with live human-root check
- **Phase B** ✅ API (`/agent/issue`, `/agent/verify/:address`, `/agent/list`) + MCP `gooddollar_verify_agent`, backed by Postgres
- **Phase C** 🔄 Website issue flow (MetaMask via Reown AppKit) — code-complete
- **Phase D** ✅ Public verify page

Next: live valid-issue test with a GoodDollar-verified wallet, then **Phase E**
(G$ stake + budget). See [docs/13-implementation-plan.md](./docs/13-implementation-plan.md).

## Prerequisites

- Node.js 20+
- pnpm 9+
- A WalletConnect/Reown project id in `VITE_WALLETCONNECT_PROJECT_ID` (for the wallet modal)
- A `DATABASE_URL` (Postgres/Supabase) for storing credentials

## Quick start

```bash
# Install dependencies
pnpm install

# Env (already present in .env for this repo)
cp .env.example .env

# Build all packages
pnpm build

# Push the DB schema (creates agent_credentials)
pnpm db:push

# Terminal 1 — API (http://localhost:3001/health)
pnpm dev:api

# Terminal 2 — Website (http://localhost:5173)
pnpm dev:web

# Optional — MCP server (stdio)
pnpm dev:mcp
```

## Monorepo layout

```
apps/
  api/            HTTP API (Hono) — /agent/* + copilot /chat
  web/            Vite + React website — MetaMask via Reown AppKit
                  (issue, My Agents, public verify)
packages/
  shared/         Constants, Zod, errors
  chain/          Viem Celo client + GoodDollar identity reads
  db/             Prisma schema
  mcp-server/     MCP tools (issueAgentId, verifyAgent, ...)
  agent-id/       EIP-712 credential sign/verify + ERC-8004 (new — Phase A)
  contracts/      Stake / budget / attestation (new — Phase E)
docs/             Overview, Agent ID spec & implementation plan
```

## Verify it works

```bash
# API health (live Celo RPC + DB)
curl http://localhost:3001/health

# Verify an agent (unknown → found:false)
curl http://localhost:3001/agent/verify/0x2222222222222222222222222222222222222222

# Website — open and connect MetaMask
open http://localhost:5173
#   Connect → (verify with GoodDollar if needed) → Issue an Agent ID
#   Public verify page: http://localhost:5173/verify?agent=0x…
```

Live Celo contracts: G$ `0x62B8…9c7A` · Identity `0xC361…2F42`.
Issuing a valid Agent ID requires the connected wallet to be a GoodDollar-verified
human (the API re-checks the live whitelist before storing).

## Documentation

Full docs: [docs/README.md](./docs/README.md)

## Database (Phase 2+)

```bash
docker compose up -d postgres
pnpm db:push
pnpm db:studio
```
