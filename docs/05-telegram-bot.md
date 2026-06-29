# Telegram bot

The Telegram bot is the primary user interface. It runs a **LangChain agent** that calls MCP tools and renders responses as chat messages + Mini App buttons.

## Runtime

| Option | Recommendation |
|--------|----------------|
| **Long polling** | Simplest for MVP / dev |
| **Webhook** | Production at scale (`api` route + `TELEGRAM_WEBHOOK_SECRET`) |

**Framework:** [Telegraf](https://telegraf.js.org/) + LangChain JS

## Session model

Each Telegram user has a session stored in DB:

```typescript
interface TelegramSession {
  telegramId: string;
  walletAddress?: `0x${string}`;
  verified: boolean;
  locale?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Wallet linking happens via Mini App → API callback → session update.

## Commands (v1)

| Command | MCP / action | Signing |
|---------|--------------|---------|
| `/start` | Welcome + link wallet button | Connect in Mini App |
| `/help` | Static help text | — |
| `/status` | `verify_status` + `claim_eligibility` + `get_balance` | No |
| `/balance` | `get_balance` | No |
| `/verify` | `generate_verify_link` | Browser FV |
| `/claim` | `prepare_claim` → Sign button | Yes |
| `/connect` | Open Mini App connect | Connect only |
| `/disconnect` | Clear wallet from session | — |

## Natural language intents

The LangChain agent maps free text to tools:

| User message | Tool chain |
|--------------|------------|
| "Am I verified?" | `verify_status` |
| "Claim my gooddollars" | `claim_eligibility` → `prepare_claim` |
| "Send 5 G$ to 0x..." | `prepare_transfer` |
| "Stream 10 G$ per month to savings" | `prepare_stream` |
| "What's the daily UBI stats?" | `get_daily_stats` |

## Agent system prompt (summary)

```
You are G$ Copilot, a helpful assistant for GoodDollar UBI on Celo.

Rules:
- Never ask for seed phrases or private keys.
- For sending, claiming, or streaming G$, always use prepare_* tools and give the user a "Confirm in wallet" button.
- If wallet is not linked, ask user to /connect first.
- If not verified, guide to /verify before claim.
- Use short, plain language. Many users are new to crypto.
- Amounts are in G$ unless stated otherwise.
```

## Message templates

### Wallet not connected

```
You haven't connected a wallet yet.

Tap below to connect via MiniPay, MetaMask, or Valora 👇
[Connect wallet] → Mini App URL
```

### Ready to claim

```
You're eligible to claim ~1.25 G$ today ✅

Tap to confirm in your wallet:
[Claim G$] → Mini App sign URL
```

### Transfer prepared

```
Send 10 G$ to 0xABC...123?

[Confirm in wallet] → sign URL
Expires in 15 minutes.
```

## Inline keyboards & Mini App buttons

Use Telegram **Web App** buttons for Mini App:

```typescript
Markup.inlineKeyboard([
  Markup.button.webApp('Connect wallet', `${MINI_APP_URL}/connect?tg=${telegramId}`),
  Markup.button.webApp('Confirm in wallet', `${MINI_APP_URL}/sign/${actionId}`),
]);
```

## Mini App → bot callback

When signing completes, Mini App calls:

```typescript
window.Telegram.WebApp.sendData(JSON.stringify({
  actionId: 'act_...',
  status: 'completed',
  txHash: '0x...',
}));
```

Bot `web_app_data` handler:

1. Parse payload
2. Update action in DB
3. Reply in chat with confirmation + CeloScan link

## Conversation memory

| Storage | Content | TTL |
|---------|---------|-----|
| LangChain buffer | Last N messages | Session |
| DB | Wallet link, verify state | Persistent |

Do not store signed txs or keys in LLM memory.

## Rate limiting

| Limit | Value |
|-------|-------|
| `prepare_*` per user | 10 / hour |
| `/verify` link generation | 3 / hour |
| Agent messages | 30 / minute |

## Error messages (user-facing)

| Internal error | User message |
|----------------|--------------|
| `NOT_VERIFIED` | "Complete face verification first: /verify" |
| `NOT_ELIGIBLE` | "You already claimed today. Next claim: {time}" |
| `SESSION_MISMATCH` | "Wallet changed — please /connect again" |
| LLM timeout | "Something went wrong. Try /status or a command." |

## Observability

Log (structured):

- `telegramId`, `tool`, `actionId`, `txHash` (never log keys)
- Metrics: DAU, claims initiated, claims completed, transfer volume

## File layout

```
apps/telegram-bot/src/
├── index.ts
├── bot.ts
├── agent/
│   ├── index.ts
│   ├── prompts.ts
│   └── tools.ts          # LangChain wrappers over MCP
├── handlers/
│   ├── start.ts
│   ├── commands.ts
│   ├── webapp-data.ts
│   └── message.ts        # NL → agent
└── middleware/
    ├── session.ts
    └── rate-limit.ts
```
