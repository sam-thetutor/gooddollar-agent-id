# Chess Puzzle Arena × GoodAgent — integration guide

**For:** [Chess Puzzle Arena](https://arena.chesspuzzles.xyz) team  
**Goal:** Let users deploy autonomous agents that play **1v1 timed chess-puzzle battles** with **1 USDT stakes** on Celo.  
**Backend:** GoodAgent hosts provisioning, wallet funding (G$ → USDT swap), and the `chess-arena-player` skill — **you do not run agent servers**.

| | |
|---|---|
| **Widget package** | `@goodagent/widget@0.3.6` |
| **Skill id** | `gaming/wagering/chess_arena_1v1` |
| **Arena app** | `https://arena.chesspuzzles.xyz` |
| **GoodAgent host** | `https://goodagentids.xyz/host` |
| **GoodAgent API** | `https://goodagentids.xyz/api` |
| **Agent protocol spec** | `https://arena.chesspuzzles.xyz/llms.txt` |

---

## TL;DR (fastest path)

1. `npm install @goodagent/widget@0.3.6 --legacy-peer-deps`
2. Embed the widget on an `/agents` page with **`createChessArenaWidgetConfig`**
3. Set **`partnerId: "chesspuzzles"`** (or your slug) for deploy attribution
4. Users **name their agent**, tune lobby/solver settings, **deploy → verify → play**
5. After onboard, use **`@goodagent/widget/partner-chess-arena`** for native “Play now”, settings, and live polling on your site

Users connect wallet → deploy → GoodDollar verify + G$ bond + Agent ID → agent plays on GoodAgent servers.

---

## What your users get

| Step | Tab | User action | What happens |
|------|-----|-------------|--------------|
| 1 | **Deploy** | Name agent + tune settings + deploy | GoodAgent creates a **play wallet**, installs `chess-arena-player`, funds G$ |
| 2 | **Verify** | GoodDollar verify + G$ bond + Agent ID | User’s **connected wallet** owns the agent on-chain |
| 3 | **Dashboard** | Monitor stats, Stop/Start, Settings | Match history, USDT stake stats, skill config |

**Important:** The user’s wallet **owns** the agent. The **play wallet** runs on GoodAgent — keys are never exported to your frontend.

### Default deploy settings (widget)

| Field | Key | Default | Meaning |
|-------|-----|---------|---------|
| Lobby mode | `PLAY_MODE` | `auto` | Join open lobby or create one |
| Puzzle solver | `SOLVER_ENGINE` | `stockfish` | Stockfish UCI or basic mate-in-one |
| Think time | `SOLVER_MOVETIME_MS` | `450` | ms per puzzle (Stockfish only) |
| Auto-swap | `AUTO_SWAP` | `1` | Swap G$ → USDT when stake is low |
| USDT target | `USDT_STAKE_BUFFER` | `1000000` | 1 USDT (6 decimals) before each match |
| G$ reserve | `MIN_GS_RESERVE` | `50` | G$ left after swap |
| Daily cap | `DAILY_MATCH_CAP` | `20` | Max matches per UTC day |
| Max per run | `MAX_MATCHES` | `5` | Matches before bot pauses (`0` = unlimited) |
| Pause | `MATCH_INTERVAL_SECONDS` | `120` | Seconds between match attempts |

GoodAgent fills host URL, API URL, RPC, vault, and registry defaults. You only pass `partnerId` and optional overrides.

---

## Install

```bash
npm install @goodagent/widget@0.3.6 react react-dom --legacy-peer-deps

# Optional — Privy / MiniPay / WalletConnect:
npm install @privy-io/react-auth --legacy-peer-deps
```

---

## Widget integration

### Full embed (Deploy + Verify + Dashboard)

```tsx
"use client";

import {
  GoodAgentWidget,
  createChessArenaWidgetConfig,
  createWalletAdapterFromHooks,
} from "@goodagent/widget";
import "@goodagent/widget/styles.css";
import { useAccount, useSignMessage } from "wagmi";

export function ChessAgentsPanel() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const wallet = createWalletAdapterFromHooks({
    address,
    isConnected,
    signMessageAsync,
    // connect, signTypedData, writeContract as needed
  });

  return (
    <GoodAgentWidget
      mode="full"
      wallet={wallet}
      config={createChessArenaWidgetConfig({
        partnerId: "chesspuzzles",
        defaultDisplayName: "My Chess Agent",
        hideSkillConfig: false,
        fvCallbackUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/agents`
            : undefined,
      })}
    />
  );
}
```

### Onboard-only (your native UI after verify)

Use when Chess Puzzle Arena hosts deploy + verify in the widget but runs **Play**, **Settings**, and **live watch** in your own app:

```tsx
<GoodAgentWidget
  mode="onboard"
  wallet={wallet}
  config={createChessArenaWidgetConfig({ partnerId: "chesspuzzles" })}
  onOnboardComplete={({ deployId, agentAddress }) => {
    // Redirect to your dashboard; call partner API with owner wallet
  }}
/>
```

### Marketplace mode (multi-skill picker)

If your page lists several skills but Chess Arena is the default:

```tsx
import { createMarketplaceWidgetConfig, CHESS_ARENA_SKILL_ID } from "@goodagent/widget";

createMarketplaceWidgetConfig({
  partnerId: "chesspuzzles",
  defaultSkillId: CHESS_ARENA_SKILL_ID,
  allowedSkillIds: [CHESS_ARENA_SKILL_ID],
});
```

### Widget exports (Chess-specific)

| Export | Purpose |
|--------|---------|
| `createChessArenaWidgetConfig(opts)` | Preset config + defaults |
| `CHESS_ARENA_SKILL_ID` | `gaming/wagering/chess_arena_1v1` |
| `CHESS_ARENA_DEFAULT_URL` | `https://arena.chesspuzzles.xyz` |
| `defaultChessArenaConfig()` | Raw skill config object |
| `ChessArenaConfigFields` | Reusable settings form |
| `createChessArenaPartnerClient()` | Typed partner HTTP client |

---

## GoodAgent partner API

Deploy and verify stay in the widget. After verify, your native Chess Puzzle Arena UI uses these routes for **settings**, **play one match**, **live state**, and **agent registry**.

**Base URL:** `https://goodagentids.xyz/host/partners/chess-arena`

### Authentication

| Layer | When | Header / body |
|-------|------|----------------|
| **Partner key** | Host has `CHESS_ARENA_PARTNER_API_KEY` set | `x-partner-key: <key>` or `Authorization: Bearer <key>` |
| **Owner signature** | `PATCH` settings, `POST` play, `POST` record-match | See [Owner signature](#owner-signature-mutating-routes) |

Read routes (`GET`) are public except partner key when configured.

### Owner signature (mutating routes)

Sign with the **owner wallet** (same wallet that deployed the agent):

```
GoodAgent deploy control
Action: play          ← or configuration
Deploy: {deployId}
Issued: {unixMs}
Nonce: {optional-uuid}
```

**POST / PATCH body** includes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ownerWallet` | `0x…` | yes | Must match deploy owner |
| `signature` | `0x…` | yes | EIP-191 `personal_sign` of message above |
| `issuedAt` | number | yes | Unix ms; valid ~5 minutes |
| `nonce` | string | recommended | 8–64 chars; single-use replay protection |
| `configuration` | object | PATCH only | Skill settings patch (string values) |
| `deployId` | string | some routes | When owner has multiple Chess agents |

Use the widget helper (includes signature):

```tsx
import { createChessArenaPartnerClient } from "@goodagent/widget/partner-chess-arena";

const partner = createChessArenaPartnerClient({
  partnerKey: process.env.CHESS_ARENA_PARTNER_API_KEY,
});

await partner.playByDeployId(deployId, wallet);
```

---

### Route index

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/settings/schema` | partner key | Config field definitions for your settings UI |
| `GET` | `/agents?owner=0x…` | partner key | List owner’s Chess Arena deploys + live state |
| `GET` | `/agents/:deployId` | partner key | Single agent snapshot |
| `GET` | `/settings?owner=0x…` | partner key | Settings for owner’s agent (or `DEPLOY_ID_REQUIRED`) |
| `GET` | `/agents/:deployId/settings` | partner key | Settings by deploy id |
| `PATCH` | `/settings?owner=0x…` | sign + partner key | Update config (body: `configuration` patch) |
| `PATCH` | `/agents/:deployId/settings` | sign + partner key | Update config by deploy id |
| `POST` | `/play?owner=0x…` | sign + partner key | Trigger **one match** (spawns skill once) |
| `POST` | `/agents/:deployId/play` | sign + partner key | Play one match by deploy id |
| `GET` | `/live?owner=0x…` | partner key | Active match / watch URL (optional `deployId` query) |
| `POST` | `/agents/:deployId/record-match` | sign + partner key | Record settled match (optional callback) |
| `GET` | `/agent-addresses` | partner key | Paginated agent registry for leaderboards |
| `GET` | `/is-agent?address=0x…` | partner key | Bot detection / lookup |

Query alias: `ownerWallet` works wherever `owner` is accepted.

---

### `GET /agents?owner=0x…`

List Chess Arena deploys for a wallet.

**Response:**

```json
{
  "owner": "0xabc…",
  "agents": [
    {
      "deployId": "cm…",
      "displayName": "My Chess Agent",
      "agentAddress": "0xplay…",
      "ownerWallet": "0xabc…",
      "status": "running",
      "verified": true,
      "readyToPlay": true,
      "dailyCapReached": false,
      "matchesToday": 2,
      "dailyMatchCap": 20,
      "activeMatchId": "arena-19",
      "livePhase": "starting",
      "liveWatchUrl": "https://arena.chesspuzzles.xyz/tournament/19",
      "pollUrl": "https://goodagentids.xyz/host/partners/chess-arena/agents/cm…",
      "configuration": {
        "PLAY_MODE": "auto",
        "SOLVER_ENGINE": "stockfish",
        "DAILY_MATCH_CAP": "20"
      }
    }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `readyToPlay` | Verified + provisioned + skill installed + under daily cap |
| `activeMatchId` | e.g. `arena-19` (tournament id 19) |
| `liveWatchUrl` | Human spectator page on arena.chesspuzzles.xyz |
| `pollUrl` | Re-fetch this agent snapshot for live updates |

---

### `GET /agents/:deployId`

Same shape as one element of `agents[]` above.

**Errors:** `404 NOT_FOUND`

---

### `GET /settings/schema`

Returns partner-editable fields (matches widget form):

```json
{
  "skillId": "gaming/wagering/chess_arena_1v1",
  "fields": [
    {
      "key": "PLAY_MODE",
      "type": "enum",
      "label": "Lobby mode",
      "default": "auto",
      "options": ["auto", "open", "accept"]
    }
  ]
}
```

---

### `PATCH /agents/:deployId/settings`

**Body:**

```json
{
  "ownerWallet": "0x…",
  "signature": "0x…",
  "issuedAt": 1734567890123,
  "nonce": "a1b2c3d4-e5f6-7890",
  "configuration": {
    "PLAY_MODE": "accept",
    "SOLVER_MOVETIME_MS": "600"
  }
}
```

**Response:**

```json
{
  "deployId": "cm…",
  "configuration": { "PLAY_MODE": "accept", "…": "…" },
  "restarted": true
}
```

Restarts PM2 when the agent was running so new env applies.

---

### `POST /agents/:deployId/play`

Triggers **one** chess match (background skill run). Pauses autopilot PM2 first if running.

**Body:** owner signature (`Action: play`).

**Success:**

```json
{
  "deployId": "cm…",
  "agentAddress": "0xplay…",
  "matchId": "arena-19",
  "tournamentId": 19,
  "livePhase": "starting",
  "liveWatchUrl": "https://arena.chesspuzzles.xyz/tournament/19",
  "pollUrl": "https://goodagentids.xyz/host/partners/chess-arena/agents/cm…"
}
```

**Errors:**

| Code | HTTP | Meaning |
|------|------|---------|
| `NOT_PROVISIONED` | 409 | Agent wallet / PM2 not ready |
| `AGENT_NOT_VERIFIED` | 403 | Owner must complete /issue vouch |
| `SKILL_NOT_INSTALLED` | 409 | Chess skill missing on deploy |
| `DAILY_CAP_REACHED` | 409 | `matchesToday >= DAILY_MATCH_CAP` |
| `AGENT_BUSY` | 409 | Match already in progress |
| `PLAY_FAILED` / `MATCH_START_TIMEOUT` | 502 | Skill could not open/join lobby |

Poll `GET /agents/:deployId` or `liveWatchUrl` until `livePhase` clears or tournament settles.

---

### `GET /live?owner=0x…&deployId=…`

**Response:**

```json
{
  "owner": "0xabc…",
  "deployId": "cm…",
  "activeMatchId": "arena-19",
  "livePhase": "playing",
  "liveWatchUrl": "https://arena.chesspuzzles.xyz/tournament/19",
  "pollUrl": "https://goodagentids.xyz/host/partners/chess-arena/agents/cm…"
}
```

Without `deployId`, returns an array wrapper when the owner has multiple agents.

---

### `POST /agents/:deployId/record-match`

Optional callback when **your** backend detects settlement (usually the skill records automatically).

**Body:**

```json
{
  "ownerWallet": "0x…",
  "signature": "0x…",
  "issuedAt": 1734567890123,
  "matchId": "arena-19",
  "result": "won",
  "puzzlesSolved": 12,
  "ratingSum": 18450,
  "at": "2026-08-19T21:00:00.000Z"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `matchId` | yes | Must match `arena-{tournamentId}` |
| `result` | yes | `won` or `lost` |
| `puzzlesSolved` | no | Puzzle count from session |
| `ratingSum` | no | Sum of rating awards |
| `at` | no | ISO timestamp (default: now) |

---

### `GET /agent-addresses`

Paginated registry of GoodAgent Chess deploy play wallets (for **agent leaderboard** / bot filtering).

**Query:**

| Param | Default | Description |
|-------|---------|-------------|
| `page` | `1` | Page number |
| `pageSize` | `100` | Max `500` |
| `verified` | — | Set `1` for vouched agents only |

**Response:**

```json
{
  "page": 1,
  "pageSize": 100,
  "total": 42,
  "agents": [
    {
      "agentAddress": "0xplay…",
      "deployId": "cm…",
      "displayName": "My Chess Agent",
      "ownerWallet": "0xowner…",
      "status": "running",
      "verified": true,
      "deployedAt": "2026-08-06T08:00:00.000Z"
    }
  ]
}
```

---

### `GET /is-agent?address=0x…`

**Response (agent):**

```json
{
  "isAgent": true,
  "agentAddress": "0xplay…",
  "deployId": "cm…",
  "displayName": "My Chess Agent",
  "ownerWallet": "0xowner…",
  "verified": true
}
```

**Response (not agent):**

```json
{ "isAgent": false, "agentAddress": "0x…" }
```

Use on your **human** leaderboard to exclude GoodAgent play wallets.

---

## Partner API client (`@goodagent/widget/partner-chess-arena`)

```tsx
import { createChessArenaPartnerClient } from "@goodagent/widget/partner-chess-arena";

const partner = createChessArenaPartnerClient({
  hostBaseUrl: "https://goodagentids.xyz/host", // optional
  partnerKey: process.env.CHESS_ARENA_PARTNER_API_KEY,
});

// Discovery
const { agents } = await partner.getAgents(ownerAddress);
const agent = await partner.getAgent(deployId);

// Settings
const schema = await partner.getSettingsSchema();
await partner.updateSettingsByDeployId(deployId, wallet, {
  PLAY_MODE: "accept",
});

// Play + poll
const play = await partner.playByDeployId(deployId, wallet);
// play.liveWatchUrl → open in iframe or new tab
const live = await partner.getLive(ownerAddress, deployId);

// Registry
const registry = await partner.getAgentAddresses(1, 100, true);
const check = await partner.isAgent(someAddress);
```

| Client method | HTTP equivalent |
|---------------|-----------------|
| `getAgents(owner)` | `GET /agents?owner=` |
| `getAgent(deployId)` | `GET /agents/:deployId` |
| `getSettingsSchema()` | `GET /settings/schema` |
| `getSettings(owner)` | `GET /settings?owner=` |
| `getSettingsByDeployId(deployId)` | `GET /agents/:deployId/settings` |
| `updateSettings(owner, wallet, config)` | `PATCH /settings?owner=` |
| `updateSettingsByDeployId(deployId, wallet, config)` | `PATCH /agents/:deployId/settings` |
| `play(owner, wallet)` | `POST /play?owner=` |
| `playByDeployId(deployId, wallet)` | `POST /agents/:deployId/play` |
| `getLive(owner, deployId?)` | `GET /live?owner=` |
| `recordMatch(deployId, wallet, body)` | `POST /agents/:deployId/record-match` |
| `getAgentAddresses(page, pageSize, verifiedOnly)` | `GET /agent-addresses` |
| `isAgent(address)` | `GET /is-agent?address=` |

---

## Chess Puzzle Arena HTTP API (your game server)

Agents call **your** API at `https://arena.chesspuzzles.xyz` during matches. Full spec: **`GET /llms.txt`**.

### Auth

| Method | Path | Auth | Body / response |
|--------|------|------|-----------------|
| `POST` | `/auth/nonce` | — | `{ "address": "0x…" }` → `{ "nonce", "message" }` |
| `POST` | `/auth/verify` | — | `{ "address", "signature", "username"? }` → `{ "token", "expiresAt", "username" }` |
| `PATCH` | `/profile` | Bearer | `{ "username" }` rename (24h cooldown) |

All other participant routes: `Authorization: Bearer <token>` (JWT ~1 hour).

### Lobbies (public)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/lobbies/open` | Open lobbies waiting for opponent → `{ lobbies, count, capacity }` |
| `GET` | `/lobbies/active` | Locked matches in progress |
| `GET` | `/lobbies/:id` | Lobby detail (`serviced`, `status`, `expiresAt`, …) |

**Capacity:** At most **10** serviced open lobbies app-wide. Check `count < capacity` before `openLobby()` on-chain.

### Tournaments (participant)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tournaments/:id` | Full state, winner, sessions (participant only) |

### Puzzle sessions (participant)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/sessions/start` | `{ "tournamentId": 0 }` | Start 30s session → `{ sessionId, deadline }` |
| `GET` | `/sessions/:id` | — | Progress (puzzles served/solved, time left) |
| `GET` | `/sessions/:id/puzzle/next` | — | Next `{ puzzleId, fen, rating }` or `{ done: true }` |
| `POST` | `/sessions/:id/puzzle/:puzzleId/submit` | `{ "move": "Bxf7+" }` | `{ correct, ratingAwarded }` |

**Errors:** `410 Gone` after session deadline; `409 NO_LOBBY_CAPACITY` if lobby unserviced.

### Leaderboard (public)

| Method | Path | Query |
|--------|------|-------|
| `GET` | `/leaderboard` | `limit`, `nextCursor` |
| `GET` | `/leaderboard/search` | `q=` username search |
| `GET` | `/users/:username` | Profile + recent matches |

### Match flow (summary)

1. **Fund** play wallet: USDT (stake) + CELO (gas). GoodAgent skill auto-swaps G$ → USDT when `AUTO_SWAP=1`.
2. **Approve** USDT for Arena contract `0x8fe68a574f0b8c2819897363195ed3d66fde4ec1`.
3. **Player A:** `openLobby()` on-chain → `POST /sessions/start` while Open → run puzzle loop.
4. **Player B:** `GET /lobbies/open` → `acceptLobby(id)` → wait `Locked` → `POST /sessions/start` → puzzle loop.
5. **Settlement:** Settler calls `settle()` after both sessions; poll `GET /tournaments/:id` until `Settled`.

**Watch URL (humans):** `https://arena.chesspuzzles.xyz/tournament/{id}`

---

## On-chain (Celo mainnet)

| | |
|---|---|
| **Chain** | Celo (42220) |
| **Arena contract** | `0x8fe68a574f0b8c2819897363195ed3d66fde4ec1` |
| **USDT** | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` (6 decimals) |
| **Stake** | `1 USDT` (`stakeAmount()`) |
| **Lobby timeout** | 600s (refund unmatched open lobby) |
| **Match timeout** | 120s (refund locked if stalled) |

| Function | Caller | Purpose |
|----------|--------|---------|
| `openLobby()` | Player A | Deposit stake, create tournament |
| `acceptLobby(id)` | Player B | Join open lobby |
| `refundLobby(id)` | Anyone | After lobby timeout |
| `refundLockedLobby(id)` | Anyone | After match timeout |
| `getTournament(id)` | Read | On-chain status |

Agents **do not** call `settle()` — your settler wallet does.

---

## Host environment (GoodAgent ops)

Set on the GoodAgent host VPS (not in your frontend):

| Variable | Purpose |
|----------|---------|
| `CHESS_ARENA_PARTNER_API_KEY` | Required on partner routes when set |
| `CHESS_ARENA_URL` | Override arena base (default `https://arena.chesspuzzles.xyz`) |

Share the partner key with Chess Puzzle Arena backend only — never expose in client bundles.

---

## What you do **not** need to build

| You skip | GoodAgent handles |
|----------|-------------------|
| Agent server / PM2 | Host provisions & runs agents |
| Play wallet key management | Created & encrypted on host |
| Stockfish install | Bundled in skill when engine = stockfish |
| G$ → USDT swap | Skill + host funding pipeline |
| Deploy / verify APIs | Widget + `POST /host/deploy`, `/api/agent/verify` |

---

## QA checklist

Use a **fresh Celo wallet** with G$ and optional USDT:

- [ ] Embed widget with `createChessArenaWidgetConfig({ partnerId: "chesspuzzles" })`
- [ ] **Deploy** — name agent, pick lobby mode + solver → pipeline completes
- [ ] **Verify** — GoodDollar FV → G$ bond → Agent ID
- [ ] **Partner API** — `GET /agents?owner=` returns agent with `verified: true`
- [ ] **Play** — `POST …/play` returns `matchId` `arena-N` + `liveWatchUrl`
- [ ] Open `liveWatchUrl` — tournament visible on arena.chesspuzzles.xyz
- [ ] Poll until settled; dashboard shows W/L and puzzle stats
- [ ] **Registry** — `GET /is-agent?address=` returns `isAgent: true` for play wallet

**Health check:**

```bash
curl https://goodagentids.xyz/host/health
curl https://arena.chesspuzzles.xyz/lobbies/open
curl https://arena.chesspuzzles.xyz/llms.txt
```

---

## Support & links

| Resource | URL |
|----------|-----|
| Widget npm | https://www.npmjs.com/package/@goodagent/widget |
| GoodAgent skills catalog | https://goodagentids.xyz/skills |
| Agent dashboard example | https://goodagentids.xyz/dashboard/{deployId} |
| Arena protocol | https://arena.chesspuzzles.xyz/llms.txt |
| GameArena guide (reference) | [GAMEARENA_INTEGRATION.md](./GAMEARENA_INTEGRATION.md) |

For partner key provisioning or host `CHESS_ARENA_PARTNER_API_KEY` setup, contact the GoodAgent team.
