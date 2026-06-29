# Architecture

## System context

G$ Copilot sits between **users (Telegram)**, **AI orchestration (LangChain)**, **agent tooling (MCP)**, and **GoodDollar on Celo**.

```mermaid
flowchart TB
    subgraph clients [Clients]
        TG[Telegram Chat]
        MA[Telegram Mini App]
        BR[Browser Fallback /connect]
        EXT[MCP Clients - Claude / Cursor]
    end

    subgraph app [Application Layer]
        BOT[Telegram Bot + LangChain Agent]
        API[HTTP API - sessions / callbacks]
        MCP[gooddollar-mcp Server]
    end

    subgraph data [Data Layer]
        DB[(PostgreSQL / Redis)]
    end

    subgraph chain [Celo / GoodDollar]
        ID[Identity Contract]
        UB[UBI Scheme / Claim]
        G$[G$ Token / SuperToken]
        SF[Superfluid CFA Forwarder]
    end

    subgraph wallets [User Wallets]
        WC[WalletConnect]
        MM[MetaMask / MiniPay / Valora]
    end

    TG --> BOT
    MA --> API
    BR --> API
    EXT --> MCP
    BOT --> MCP
    BOT --> API
    MCP --> ID
    MCP --> UB
    MCP --> G$
    MCP --> SF
    API --> DB
    BOT --> DB
    MA --> WC --> MM
    BR --> WC --> MM
    MA --> G$
    MA --> UB
```

## Component responsibilities

| Component | Responsibility | Does NOT do |
|-----------|----------------|-------------|
| **Telegram bot** | NLU, command routing, replies, Mini App buttons | Sign transactions, store keys |
| **LangChain agent** | Tool selection, conversation memory, guardrails | Direct chain writes without user sign |
| **MCP server** | Tool schemas, read-only chain calls, tx preparation | Broadcast signed txs (except via dedicated relay with user sig) |
| **Mini App** | WalletConnect, display tx, request wallet signature | Run LLM inference |
| **HTTP API** | FV callbacks, session tokens, pending tx store, webhooks | Custody funds |
| **Database** | Map telegram↔wallet, pending actions, audit log | Hold secrets beyond API keys |

## Request flows

### Flow A — Read-only query (no signing)

```mermaid
sequenceDiagram
    participant U as User
    participant B as Telegram Bot
    participant A as LangChain Agent
    participant M as MCP Server
    participant C as Celo RPC

    U->>B: "What's my balance?"
    B->>A: Message + session context
    A->>M: get_balance(wallet)
    M->>C: eth_call / balanceOf
    C-->>M: balance
    M-->>A: formatted result
    A-->>B: natural language reply
    B-->>U: "You have 42.5 G$"
```

### Flow B — Write action (claim / send / stream)

```mermaid
sequenceDiagram
    participant U as User
    participant B as Telegram Bot
    participant A as LangChain Agent
    participant M as MCP Server
    participant API as HTTP API
    participant MA as Mini App
    participant W as Wallet

    U->>B: "Send 10 G$ to 0xABC..."
    B->>A: intent
    A->>M: prepare_transfer(from, to, amount)
    M-->>A: unsigned tx payload + actionId
    A->>API: store pending action
    B-->>U: Button "Confirm in wallet"
    U->>MA: Opens Mini App ?action=transfer&id=...
    MA->>W: WalletConnect + signTransaction
    W-->>MA: txHash
    MA->>API: POST /actions/complete
    API->>B: notify user
    B-->>U: "Sent 10 G$ ✅ tx: 0x..."
```

### Flow C — Face verification

```mermaid
sequenceDiagram
    participant U as User
    participant B as Telegram Bot
    participant API as HTTP API
    participant ID as GoodDollar Identity
    participant C as Celo

    U->>B: /verify
    B->>API: create FV session (telegram_id, wallet)
    API-->>B: FV URL with callback
    B-->>U: "Complete verification" link
    U->>ID: Face verification flow
    ID->>API: callback /verified?token=...
    API->>C: verify getWhitelistedRoot
    API->>B: webhook update session
    B-->>U: "Verified ✅ You can claim now"
```

## Deployment topology

```mermaid
flowchart LR
    subgraph vercel [Vercel]
        MINI[Mini App static + API routes]
    end

    subgraph compute [Long-running services]
        BOT[Telegram Bot process]
        MCP[MCP Server process]
    end

    subgraph managed [Managed data]
        PG[(PostgreSQL)]
        RD[(Redis - optional)]
    end

    BOT --> PG
    MCP --> PG
    MINI --> PG
    BOT --> MCP
```

| Service | Host | Notes |
|---------|------|-------|
| Mini App + sign API | Vercel | Edge-friendly; FV callback URLs |
| Telegram bot | Railway / Fly.io / VPS | Long polling or webhook |
| MCP server | Same host or separate | stdio for local; SSE/HTTP for remote |
| Database | Neon / Supabase / Railway | Sessions + pending actions |
| Redis | Optional | Rate limits, FV token TTL |

## Environment separation

| Env | Chain | GoodDollar SDK env | Purpose |
|-----|-------|-------------------|---------|
| `development` | Celo Alfajores or dev G$ | `development` | Local bot + MCP testing |
| `staging` | Celo mainnet (limited) | `production` | Pre-launch QA |
| `production` | Celo mainnet | `production` | Season 4 users |

Dev wallet claims: [goodwallet.dev](https://goodwallet.dev)

## Key design decisions

1. **MCP as shared core** — Bot and external agents use the same tools; avoids duplicating chain logic.
2. **Mini App for all writes** — Single signing surface; consistent WalletConnect UX.
3. **Pending action pattern** — Bot stores intent server-side; Mini App loads by `actionId` (no unsigned tx in URL params alone).
4. **Telegram Web via QR** — WalletConnect shows QR on desktop; mobile Telegram uses deep links.
5. **Browser fallback** — `/connect` and `/sign` pages for MetaMask extension users outside Telegram WebView.

## Phase 2 extensions (documented, not v1)

- Community bill pool contracts + `/pool` commands
- Esusu / Balaio tool adapters in MCP
- Gas faucet tool (Esusu-style sponsorship for first claim)
- Flow State voting embed in Mini App
