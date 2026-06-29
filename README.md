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

**Pivoted to GoodDollar Agent ID.** Foundation reused from the earlier "G$ Copilot" scope
(GoodDollar identity reads, MCP server, MiniPay app + self-hosted LLM copilot, live VPS
deploy). Next: **Phase A — credential core** (`packages/agent-id`). See
[docs/13-implementation-plan.md](./docs/13-implementation-plan.md).

## Prerequisites

- Node.js 20+
- pnpm 9+
- Telegram bot token ([@BotFather](https://t.me/BotFather)) for the bot app

## Quick start

```bash
# Install dependencies
pnpm install

# Copy env and add TELEGRAM_BOT_TOKEN
cp .env.example .env

# Build all packages
pnpm build

# Terminal 1 — API (http://localhost:3001/health)
pnpm dev:api

# Terminal 2 — Telegram bot
pnpm dev:bot

# Terminal 3 — Mini App (http://localhost:5173)
pnpm dev:mini

# Optional — MCP server (stdio)
pnpm dev:mcp
```

## Monorepo layout

```
apps/
  api/            HTTP API (Hono) — /agent/* + copilot /chat
  mini-app/       Vite + React MiniPay app (issue, My Agents, verify)
  telegram-bot/   Telegraf bot (secondary channel)
packages/
  shared/         Constants, Zod, errors
  chain/          Viem Celo client + GoodDollar identity reads
  db/             Prisma schema
  mcp-server/     MCP tools (issueAgentId, verifyAgent, ...)
  agent-id/       EIP-712 credential sign/verify + ERC-8004 (new — Phase A)
  contracts/      Stake / budget / attestation (new — Phase E)
docs/             Overview, Agent ID spec & implementation plan
```

## Phase 0 verification

```bash
curl http://localhost:3001/health
# → { "ok": true, "service": "g-copilot-api", ... }

pnpm dev:bot
# Send /start to your bot in Telegram

pnpm dev:mini
# Open http://localhost:5173
```

## Phase 1 verification (live chain reads)

```bash
pnpm build

# Bot: send these to your bot (any Celo address works, no wallet connect yet)
#   /balance 0xYourCeloAddress
#   /verify  0xYourCeloAddress
#   /status  0xYourCeloAddress

# MCP server: JSON-RPC stdio roundtrip over all read tools
cp scripts/mcp-smoke.mjs packages/mcp-server/ && \
  (cd packages/mcp-server && node mcp-smoke.mjs; rm -f mcp-smoke.mjs)
```

Live Celo contracts: G$ `0x62B8…9c7A` · Identity `0xC361…2F42` · UBIScheme `0x43d7…a4A1`.

## Phase 2 verification (API + DB)

```bash
# Push schema (reads root .env automatically)
pnpm db:push
pnpm db:studio        # browse tables in a GUI

# Start the API, then exercise the endpoints
pnpm dev:api
curl -X POST http://localhost:3001/sessions/link \
  -H 'content-type: application/json' \
  -d '{"telegramId":"123","wallet":"0x66e7D7839333f502df355f5bD87AEa24F7bD6Dc6"}'
curl http://localhost:3001/sessions/123

# Bot: link a wallet, then omit the address
pnpm dev:bot
#   /connect 0x66e7D7839333f502df355f5bD87AEa24F7bD6Dc6
#   /status            (uses the linked wallet)
#   /disconnect
```

App tables live in the `gcopilot` schema. See `.env.example` for the `DATABASE_URL` format (local Docker or Supabase pooler).

## Phase 3 verification (wallet connect)

```bash
# Browser fallback (no Telegram needed): connect a wallet and link to a session
pnpm dev:api
pnpm dev:mini
# open http://localhost:5173/connect?tg=123  → connect wallet → auto-links to session 123
curl http://localhost:3001/sessions/123     # → walletAddress populated

# In Telegram (manual link works without HTTPS):
pnpm dev:bot
#   /connect 0xYourCeloAddress   → links, then /status with no arg
```

Full in-Telegram Mini App flow (mobile/web) requires the Mini App + API on public **HTTPS** — set `MINI_APP_URL` and `VITE_API_BASE_URL` to your deployed URLs. `initData` HMAC is enforced automatically in production (or set `REQUIRE_INIT_DATA=true`).

## Documentation

Full docs: [docs/README.md](./docs/README.md)

## Database (Phase 2+)

```bash
docker compose up -d postgres
pnpm db:push
pnpm db:studio
```
