# GameArena Partner API

GoodAgent host routes for native GameArena integration. Deploy + verify stays in the **GoodAgent widget**; everything after that (settings, play, live watch) uses this API from your Challenge AI UI.

**Production base URL**

```
https://goodagentids.xyz/host/partners/gamearena
```

**Local dev**

```
http://localhost:3002/partners/gamearena
```

---

## Quick reference

| Method | Path | Auth | What it does |
|--------|------|------|--------------|
| `GET` | `/agents?owner=0x…` | — | Look up the owner’s competition agent + live state |
| `GET` | `/agents/:deployId` | — | Same snapshot for a specific deploy id |
| `GET` | `/settings/schema` | — | Field definitions for your settings screen |
| `GET` | `/settings?owner=0x…` | — | Current GameArena config for the owner’s first agent |
| `GET` | `/agents/:deployId/settings` | — | Current config for one deploy |
| `PATCH` | `/settings?owner=0x…` | Sign + partner key* | Update agent settings |
| `PATCH` | `/agents/:deployId/settings` | Sign + partner key* | Update settings by deploy id |
| `POST` | `/agents/:deployId/start` | Sign + partner key* | Resume PM2 (continuous play loop) |
| `POST` | `/agents/:deployId/stop` | Sign + partner key* | Pause PM2 |
| `POST` | `/play?owner=0x…` | Sign + partner key* | **Play one MARKOV match now** |
| `POST` | `/agents/:deployId/play` | Sign + partner key* | Play one match by deploy id |
| `GET` | `/live?owner=0x…` | — | Poll active match + watch URL |
| `GET` | `/agents/:deployId/live` | — | Poll live state by deploy id |

\* Partner key required when `GAMEARENA_PARTNER_API_KEY` is set on the host (production). See [Authentication](#authentication).

**Related (not under `/partners`)**

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/host/arena/live/:matchId` | SSE live stream proxy for spectators |

---

## Competition rule: one agent per wallet

The partner API only operates on the **first** GameArena deploy for a wallet (oldest `createdAt`). Additional deploys exist in GoodAgent but return `409 GAMEARENA_FIRST_AGENT_ONLY` on settings/play/start.

---

## Authentication

### Read routes (GET)

No signature. Pass the owner wallet:

```
?owner=0xYourWallet
```

Also accepts `?ownerWallet=` (same as other GoodAgent host routes).

### Write routes (PATCH, POST)

Require an **owner wallet signature** in the JSON body:

```json
{
  "ownerWallet": "0xYourWallet",
  "issuedAt": 1722614400000,
  "signature": "0x…"
}
```

The signed message format:

```
GoodAgent deploy control
Action: {action}
Deploy: {deployId}
Issued: {issuedAt}
```

| Route | `Action` value |
|-------|----------------|
| `PATCH …/settings` | `configuration` |
| `POST …/start` | `resume` |
| `POST …/stop` | `pause` |
| `POST …/play` | `play` |

Signatures expire after **5 minutes**. Use the same signing flow as the GoodAgent widget dashboard.

### Partner key (server-to-server)

When the host has `GAMEARENA_PARTNER_API_KEY` set, mutating routes also require:

```
x-partner-key: <secret>
```

Or:

```
Authorization: Bearer <secret>
```

If the env var is **not** set (local dev), the partner key is optional.

---

## Routes in detail

### `GET /agents?owner=0x…`

Resolve the owner’s GameArena agent. Returns **0 or 1** agent (first deploy only).

**Example**

```bash
curl "https://goodagentids.xyz/host/partners/gamearena/agents?owner=0xa479b8c6030cbb01f8e9f6acb2ad2c757c81894d"
```

**Response `200`**

```json
{
  "owner": "0xa479b8c6030cbb01f8e9f6acb2ad2c757c81894d",
  "agents": [
    {
      "deployId": "cmrxqb1eq033ekqnqxrc20qhr",
      "displayName": "mario",
      "agentAddress": "0x2FE3c0097a4953153EA288Aab71842AACE22ef5e",
      "ownerWallet": "0xa479b8c6030cbb01f8e9f6acb2ad2c757c81894d",
      "gamePassUsername": "mario",
      "status": "paused",
      "verified": true,
      "readyToPlay": true,
      "activeMatchId": null,
      "livePhase": null,
      "liveWatchUrl": null
    }
  ]
}
```

**Response fields**

| Field | Description |
|-------|-------------|
| `deployId` | GoodAgent deploy id |
| `displayName` | Agent name from deploy |
| `agentAddress` | **Play wallet** — hits GameArena as the player |
| `gamePassUsername` | On-chain GameArena Pass name |
| `status` | Host status: `running`, `paused`, `failed`, etc. |
| `verified` | Agent ID vouch complete at `/issue` |
| `readyToPlay` | Verified + provisioned + GameArena skill installed |
| `activeMatchId` | Current match id when in a game |
| `livePhase` | `starting`, `playing`, or `null` |
| `liveWatchUrl` | SSE proxy URL while a match is active; `null` when idle |

**Errors**

| Status | Code | When |
|--------|------|------|
| `400` | — | Missing or invalid `owner` param |
| `200` | — | No agent → `"agents": []` |

---

### `GET /agents/:deployId`

Single-agent snapshot (same shape as one entry in `agents[]` above).

**Example**

```bash
curl "https://goodagentids.xyz/host/partners/gamearena/agents/cmrxqb1eq033ekqnqxrc20qhr"
```

**Errors**

| Status | Code | When |
|--------|------|------|
| `404` | `NOT_FOUND` | Unknown deploy or not a GameArena deploy |

---

### `GET /settings/schema`

Returns field definitions so you can render a native settings UI (labels, types, defaults, conditional fields).

**Example**

```bash
curl "https://goodagentids.xyz/host/partners/gamearena/settings/schema"
```

**Response `200`**

```json
{
  "skillId": "gaming/wagering/gamearena_1v1",
  "fields": [
    {
      "key": "PLAY_MODE",
      "type": "enum",
      "label": "Play mode",
      "default": "offchain",
      "options": ["offchain", "onchain", "auto"]
    },
    {
      "key": "MARKOV_STRATEGY",
      "type": "enum",
      "label": "Strategy vs MARKOV",
      "default": "random",
      "options": ["random", "sequence", "fixed", "counter"]
    }
  ]
}
```

**Configurable keys** (full list in schema response):

- `PLAY_MODE`, `MARKOV_STRATEGY`, `RPS_SEQUENCE`, `RPS_FIXED`
- `DAILY_MATCH_CAP`, `MAX_MATCHES`, `MATCH_INTERVAL_SECONDS`, `ROUND_PACE_MS`
- `AUTO_REFILL`, `DAILY_REFILL_CAP_GS`, `MAX_REFILLS_PER_DAY`
- `WAGER_GS`, `DAILY_LOSS_CAP_GS`, `ACCEPT_TIMEOUT_SECONDS`, `GAME_TYPE`

---

### `GET /settings?owner=0x…`

Current configuration for the owner’s **first** GameArena agent.

**Example**

```bash
curl "https://goodagentids.xyz/host/partners/gamearena/settings?owner=0xa479…1894d"
```

**Response `200`**

```json
{
  "owner": "0xa479…1894d",
  "deployId": "cmrxqb1eq…",
  "displayName": "mario",
  "agentAddress": "0x2FE3…ef5e",
  "ownerWallet": "0xa479…1894d",
  "status": "paused",
  "verified": true,
  "readyToPlay": true,
  "configuration": {
    "PLAY_MODE": "offchain",
    "MARKOV_STRATEGY": "random",
    "RPS_SEQUENCE": "rock,paper,scissors",
    "RPS_FIXED": "rock",
    "DAILY_MATCH_CAP": "50",
    "MAX_MATCHES": "10",
    "MATCH_INTERVAL_SECONDS": "300",
    "ROUND_PACE_MS": "1000",
    "AUTO_REFILL": "1",
    "DAILY_REFILL_CAP_GS": "20",
    "MAX_REFILLS_PER_DAY": "10",
    "WAGER_GS": "1",
    "DAILY_LOSS_CAP_GS": "20",
    "ACCEPT_TIMEOUT_SECONDS": "90",
    "GAME_TYPE": "0"
  }
}
```

**Errors**

| Status | Code | When |
|--------|------|------|
| `400` | — | Invalid owner param |
| `404` | `NO_AGENT` | No GameArena deploy for wallet |

---

### `GET /agents/:deployId/settings`

Same as `GET /settings?owner=` but keyed by deploy id.

**Errors**

| Status | Code | When |
|--------|------|------|
| `404` | `NOT_FOUND` | Unknown deploy |

---

### `PATCH /settings?owner=0x…`

Update GameArena skill configuration. Partial updates allowed; unknown keys are ignored.

**Example**

```bash
curl -X PATCH "https://goodagentids.xyz/host/partners/gamearena/settings?owner=0xa479…1894d" \
  -H "Content-Type: application/json" \
  -H "x-partner-key: YOUR_SECRET" \
  -d '{
    "ownerWallet": "0xa479b8c6030cbb01f8e9f6acb2ad2c757c81894d",
    "issuedAt": 1722614400000,
    "signature": "0x…",
    "configuration": {
      "MARKOV_STRATEGY": "sequence",
      "RPS_SEQUENCE": "rock,paper,scissors"
    }
  }'
```

**Response `200`**

```json
{
  "owner": "0xa479…1894d",
  "deployId": "cmrxqb1eq…",
  "configuration": { "…": "…" },
  "restarted": true
}
```

`restarted: true` when PM2 was restarted to pick up new env.

**Errors**

| Status | Code | When |
|--------|------|------|
| `401` | `OWNER_AUTH_REQUIRED`, `INVALID_SIGNATURE`, etc. | Bad/missing signature |
| `401` | `INVALID_PARTNER_KEY` | Wrong partner key |
| `404` | `NO_AGENT` | No deploy for owner |
| `409` | `GAMEARENA_FIRST_AGENT_ONLY` | Not the first GameArena deploy |
| `500` | `CONFIG_APPLY_FAILED` | Host failed to apply config |

---

### `PATCH /agents/:deployId/settings`

Same as `PATCH /settings?owner=` but keyed by deploy id. Same auth and body.

---

### `POST /agents/:deployId/start`

Resume the agent’s PM2 process (continuous play loop on interval). Use when you want the agent to keep playing autonomously.

**Example**

```bash
curl -X POST "https://goodagentids.xyz/host/partners/gamearena/agents/cmrxqb1eq…/start" \
  -H "Content-Type: application/json" \
  -H "x-partner-key: YOUR_SECRET" \
  -d '{
    "ownerWallet": "0xa479…1894d",
    "issuedAt": 1722614400000,
    "signature": "0x…"
  }'
```

**Response `200`**

```json
{
  "deployId": "cmrxqb1eq…",
  "status": "running",
  "pm2Name": "ga-cmrxqb1eq033ekqnqxrc20qhr"
}
```

**Errors**

| Status | Code | When |
|--------|------|------|
| `403` | `AGENT_NOT_VERIFIED` | Not vouched at `/issue` |
| `409` | `NOT_PROVISIONED` | Agent never fully provisioned |
| `409` | `GAMEARENA_FIRST_AGENT_ONLY` | Not first deploy |
| `500` | `PM2_START_FAILED` | PM2 could not start |

---

### `POST /agents/:deployId/stop`

Pause the agent’s PM2 process.

**Example**

```bash
curl -X POST "https://goodagentids.xyz/host/partners/gamearena/agents/cmrxqb1eq…/stop" \
  -H "Content-Type: application/json" \
  -H "x-partner-key: YOUR_SECRET" \
  -d '{
    "ownerWallet": "0xa479…1894d",
    "issuedAt": 1722614400000,
    "signature": "0x…"
  }'
```

**Response `200`**

```json
{
  "deployId": "cmrxqb1eq…",
  "status": "paused"
}
```

---

### `POST /play?owner=0x…`

**Primary “Play with your agent” button.** Starts **one immediate** off-chain MARKOV match. GoodAgent’s VPS agent picks moves; GameArena’s scoped `x-agent-key` handles arena HTTP — you do **not** call start/throw from your frontend.

**Example**

```bash
curl -X POST "https://goodagentids.xyz/host/partners/gamearena/play?owner=0xa479…1894d" \
  -H "Content-Type: application/json" \
  -H "x-partner-key: YOUR_SECRET" \
  -d '{
    "ownerWallet": "0xa479b8c6030cbb01f8e9f6acb2ad2c757c81894d",
    "issuedAt": 1722614400000,
    "signature": "0x…"
  }'
```

**Response `200`**

```json
{
  "deployId": "cmrxqb1eq…",
  "agentAddress": "0x2FE3…ef5e",
  "matchId": "am_88d1f6d9…",
  "livePhase": "starting",
  "liveWatchUrl": "https://goodagentids.xyz/host/arena/live/am_88d1f6d9…",
  "pollUrl": "https://goodagentids.xyz/host/partners/gamearena/agents/cmrxqb1eq…"
}
```

**Flow after play**

1. Show `liveWatchUrl` in your UI (SSE spectator stream).
2. Poll `GET /agents/:deployId` or `GET /live?owner=` until `livePhase` is `playing`.
3. Match ends when `livePhase` returns to `null`.

**Errors**

| Status | Code | When |
|--------|------|------|
| `403` | `AGENT_NOT_VERIFIED` | Not vouched |
| `409` | `NOT_PROVISIONED` | Not provisioned |
| `409` | `SKILL_NOT_INSTALLED` | GameArena skill missing |
| `409` | `AGENT_BUSY` | Already in a match |
| `409` | `GAMEARENA_FIRST_AGENT_ONLY` | Not first deploy |
| `502` | `PLAY_FAILED`, `MATCH_NOT_STARTED` | Arena/skill error (see `logTail` in body) |

---

### `POST /agents/:deployId/play`

Same as `POST /play?owner=` but keyed by deploy id.

---

### `GET /live?owner=0x…`

Lightweight poll for active match state (no full agent object).

**Example**

```bash
curl "https://goodagentids.xyz/host/partners/gamearena/live?owner=0xa479…1894d"
```

**Response `200`**

```json
{
  "owner": "0xa479…1894d",
  "deployId": "cmrxqb1eq…",
  "activeMatchId": "am_88d1f6d9…",
  "livePhase": "playing",
  "liveWatchUrl": "https://goodagentids.xyz/host/arena/live/am_88d1f6d9…"
}
```

**Errors**

| Status | Code | When |
|--------|------|------|
| `404` | `NO_AGENT` | No deploy for owner |

---

### `GET /agents/:deployId/live`

Same as `GET /live?owner=` but keyed by deploy id (no `owner` in response).

---

## Live spectating

While `livePhase` is `starting` or `playing`:

```
GET https://goodagentids.xyz/host/arena/live/{matchId}
```

Server-Sent Events stream. GoodAgent proxies GameArena’s upstream SSE with the correct Origin header.

---

## End-to-end integration flow

```
1. User deploys once via GoodAgent widget (connect → deploy → verify → stake)
2. User connects wallet on GameArena
3. GET  /partners/gamearena/agents?owner=0x…        → show their agent
4. GET  /partners/gamearena/settings?owner=0x…      → load settings screen
5. PATCH /partners/gamearena/settings?owner=0x…     → save strategy/caps (signed)
6. POST /partners/gamearena/play?owner=0x…          → start one match (signed)
7. GET  /host/arena/live/:matchId                   → stream live gameplay
8. GET  /partners/gamearena/live?owner=0x…          → poll until match ends
```

---

## Host environment variables

| Variable | Purpose |
|----------|---------|
| `GAMEARENA_PARTNER_API_KEY` | Secret for `x-partner-key` on mutating routes |
| `GAMEARENA_AGENT_API_KEY` | Scoped key injected into agents for GameArena start/throw |
| `GAMEARENA_AGENT_API_URL` | Optional override for GameArena agent API base |
| `PUBLIC_HOST_URL` | Base for `liveWatchUrl` and `pollUrl` (default: goodagentids.xyz) |

---

## Source code

| Path | Description |
|------|-------------|
| `apps/host/src/partners/gamearena.ts` | Route handlers |
| `packages/shared/src/gamearena-partner-config.ts` | Settings schema + sanitization |
| `packages/runtime/src/gamearena-play-once.ts` | One-shot match runner |
| `packages/widget/GAMEARENA_PARTNER_API.md` | **Partner API reference (send to GameArena dev)** |
| `packages/widget/GAMEARENA_PARTNER_API.md` | **This document — partner API reference** |
| `packages/widget/GAMEARENA_INTEGRATION.md` | Widget embed + broader integration guide |
