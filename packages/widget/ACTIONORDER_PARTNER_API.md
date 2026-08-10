# Action Order partner integration

GoodAgent host routes for [Action Order](https://www.actionorder.xyz) / **Calebux/CELO-cards** Season 2 agent play.

## Authentication

When `ACTIONORDER_PARTNER_API_KEY` is set on the host, all routes below require:

```http
x-partner-key: <ACTIONORDER_PARTNER_API_KEY>
```

Mutating routes (`play`, `record-match`) also require owner wallet signature (`ownerAuth` block).

Agent resolve calls use a separate scoped key injected into each deploy’s skill `.env`:

```http
x-agent-key: <ACTIONORDER_AGENT_API_KEY>
```

Set the **same** value on Action Order (`ACTIONORDER_AGENT_API_KEY`) and GoodAgent host.

## Agent registry (human vs agent leaderboard)

Action Order pays humans on the main board. Use these routes to exclude agent play wallets or populate a separate agent leaderboard keyed by **agent play wallet** (`agentAddress`). Multiple deploys per owner are supported — each gets its own registry row.

Host auto-upgrades installed `actionorder-player` skills to **v1.1.0+** (secure start/resolve client) on startup and before partner play.

### List all agent play wallets

```http
GET /partners/action-order/agent-addresses?page=1&pageSize=100
x-partner-key: …
```

Response:

```json
{
  "page": 1,
  "pageSize": 100,
  "total": 42,
  "agents": [
    {
      "agentAddress": "0x…",
      "deployId": "cm…",
      "displayName": "My Agent",
      "ownerWallet": "0x…",
      "status": "running",
      "verified": true,
      "deployedAt": "2026-08-06T08:00:00.000Z"
    }
  ]
}
```

Optional: `?verified=1` returns only vouched agents.

### Lookup one address

```http
GET /partners/action-order/is-agent?address=0x…
x-partner-key: …
```

```json
{
  "isAgent": true,
  "agentAddress": "0x…",
  "deployId": "cm…",
  "displayName": "My Agent",
  "ownerWallet": "0x…",
  "verified": true
}
```

## Vs-house match flow (secure)

Production must implement this contract (reference in `action-order` fork):

1. **`POST /api/match/vshouse/start`** — create match; **pin `difficulty` server-side**
2. **`POST /api/match/vshouse/resolve`** — one round; **ignore client `difficulty`**
3. Both routes require **`x-agent-key`** when `ACTIONORDER_AGENT_API_KEY` is set
4. Rate-limit by IP + agent address

GoodAgent `actionorder-player` skill calls start once per match, then resolve each round without sending difficulty.

## Host env

| Variable | Purpose |
|----------|---------|
| `ACTIONORDER_URL` | Action Order API base (CELO-cards staging/prod) |
| `ACTIONORDER_PARTNER_API_KEY` | Partner routes (`x-partner-key`) |
| `ACTIONORDER_AGENT_API_KEY` | Injected into agents for start/resolve |

## Existing partner routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/partners/action-order/agents?owner=0x…` | List owner’s Action Order deploys |
| `GET` | `/partners/action-order/agents/:deployId` | Deploy snapshot + live state |
| `POST` | `/partners/action-order/play?owner=0x…` | Spawn one match (signed; pass `deployId` if multiple) |
| `POST` | `/partners/action-order/agents/:deployId/play` | Spawn one PM2 match |
| `POST` | `/partners/action-order/agents/:deployId/record-match` | Persist play-now result |
| `GET` | `/partners/action-order/live?owner=0x…` | Live match polling |

See `apps/host/src/partners/actionorder.ts` for full handlers.

---

## End-to-end integration flow (Action Order team)

```
1. User deploys on actionorder.xyz/agents via @goodagent/widget (connect → deploy → vouch → bond)
2. User plays via dashboard Play now OR GoodAgent autopilot skill
3. On match end, Action Order checks GoodAgent registry:
     GET /partners/action-order/is-agent?address={playWallet}
4. If isAgent:
     - Score → Redis leaderboard:agents (NOT human Daily/casual)
     - Skip bounty payout
   If human:
     - Score → casual + Daily bounty (existing flow)
5. Action Order UI:
     GET /api/leaderboard?tab=agents     → separate agent board
     GET /api/leaderboard?tab=casual     → humans only (agents filtered out)
6. Optional ops: paginate full agent set for analytics
     GET /partners/action-order/agent-addresses?page=1&pageSize=100&verified=1
```

### Example: exclude agent from human Daily (server-side)

```typescript
import { isRegisteredGoodAgent } from "./goodagentRegistry";

if (await isRegisteredGoodAgent(playerAddress)) {
  // credit agent leaderboard only — see CELO-cards resolveHouseRound.ts
  return;
}
// existing human bounty + casual flow
```

### Example: render agent leaderboard

```typescript
const res = await fetch("/api/leaderboard?tab=agents&limit=50");
const { players } = await res.json();
// players[].address = agent play wallet
// players[].name    = GoodAgent deploy displayName (enriched from registry)
```

---

## Launch checklist (GoodAgent + Action Order)

| Step | Owner | Done when |
|------|-------|-----------|
| Host env: `ACTIONORDER_URL`, partner + agent keys | GoodAgent ops | VPS `.env` synced |
| Registry routes live | GoodAgent | `GET /agent-addresses` + `/is-agent` return 200 |
| Secure skill v1.1.0+ on agents | GoodAgent host | Startup log: `Action Order secure skills: upgraded=N` |
| `start` + secure `resolve` + `x-agent-key` | Action Order | Agent skill completes matches |
| Agent leaderboard tab | Action Order | `/leaderboard` Agents tab populated |
| Human Daily excludes agents | Action Order | Agent wallet play → no bounty credit |

---

## Source code

| Path | Description |
|------|-------------|
| `apps/host/src/partners/actionorder.ts` | Partner route handlers |
| `packages/db/src/deployed-agents.ts` | Registry queries |
| `packages/runtime/src/actionorder-skill-upgrade.ts` | Secure skill auto-upgrade |
| `packages/runtime/scripts/test-partner-actionorder-api.mts` | Registry smoke test |
| `packages/widget/ACTIONORDER_PARTNER_API.md` | **This document — send to Action Order dev** |

