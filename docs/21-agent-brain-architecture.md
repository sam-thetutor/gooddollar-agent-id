# 21 — Agent Brain Architecture (implemented)

The hybrid agent architecture as **actually shipped**: every hosted GoodAgent
deploy can attach an LLM "brain" that runs beside its action skills, chats on
Telegram, calls live tools, and pays for inference with GoodDollars through
the decentralized AntSeed network.

Companion to the design-phase document
(`packages/agent-runtime/REAL_AGENT_ARCHITECTURE.md`). Where the two differ,
this file describes what is running in production.

- Pilot: **My ACTION-ORDER Agent** (`@actionorder_bot`) — brain + 2 game skills.
- Productized: "Enable AI chat (Telegram)" toggle in the deploy wizard at
  goodagentids.xyz/deploy.

---

## 1. The idea in one diagram

A deployed agent used to be only the bottom row (a scripted skill loop under
PM2). The new architecture adds a cognitive layer on top and an economic layer
underneath, without touching the deterministic skill processes.

```mermaid
flowchart TB
    subgraph identity["IDENTITY — who vouches"]
        GID["GoodAgent ID<br/>face-verified human + 250 G$ bond<br/>ERC-8004 / EIP-712 on Celo"]
    end

    subgraph cognition["COGNITION — how it thinks"]
        BRAIN["@goodagent/agent-brain<br/>persona + knowledge + memory<br/>PM2: ga-brain-&lt;deployId&gt;"]
        TOOLS["Tools<br/>agent_stats · verify_address<br/>check_claim_eligibility"]
    end

    subgraph action["ACTION — what it does"]
        SKILLS["Skill processes (autonomous)<br/>GameArena · ActionOrder · reminders<br/>PM2: ga-&lt;deployId&gt;"]
    end

    subgraph economy["ECONOMY — who pays"]
        ANTSEED["AntSeed P2P inference<br/>buyer proxy localhost:8377"]
        GD["G$ compute credits<br/>Celo vault → USDC on Base"]
    end

    USER(("Telegram user")) <--> BRAIN
    BRAIN --> TOOLS
    TOOLS -.reads live state.-> SKILLS
    GID -. backs .-> BRAIN
    GID -. backs .-> SKILLS
    BRAIN --> ANTSEED
    GD --> ANTSEED
```

Key property: **brain and body are separate PM2 processes.** If AntSeed peers
are slow or down, the game skill keeps playing. If a skill crashes, the bot
keeps chatting.

---

## 2. System components

Everything that participates in a brain-enabled deploy, across the user's
browser, the VPS, and the chains.

```mermaid
flowchart LR
    subgraph web["Browser — goodagentids.xyz"]
        WIZ["Deploy wizard<br/>(apps/web Deploy.tsx)<br/>AI-chat toggle + bot token"]
        DASH["Dashboard<br/>(DeployDashboard.tsx)<br/>Chat pulse: Online · @bot"]
    end

    subgraph vps["VPS (geinz-vps)"]
        HOST["Host API (apps/host)<br/>POST /deploy · GET /deploy/:id/status"]
        DB[("Postgres (Prisma)<br/>DeployedAgent<br/>brainConfig · brainBotTokenEnc")]
        PIPE["Deploy pipeline<br/>(packages/runtime)"]
        subgraph pm2["PM2 per deploy"]
            SKILLP["ga-&lt;deployId&gt;<br/>skill runtime"]
            BRAINP["ga-brain-&lt;deployId&gt;<br/>agent-brain CLI"]
        end
        PROXY["AntSeed buyer proxy<br/>localhost:8377 (PM2: antseed-buyer)"]
    end

    subgraph external["External"]
        TG["Telegram Bot API"]
        PEERS["AntSeed provider peers<br/>(paid + free models)"]
        CELO["Celo<br/>G$ vault + UBIScheme"]
        BASE["Base<br/>AntseedDeposits (USDC)"]
        WORKER["GoodDollar AntSeed Worker<br/>(Cloudflare)"]
    end

    WIZ -->|"brain: {enabled, botToken, model}"| HOST
    DASH -->|status poll| HOST
    HOST --> DB
    HOST --> PIPE
    PIPE -->|writes persona/manifest,<br/>ecosystem.config.cjs| pm2
    BRAINP <-->|long-poll| TG
    BRAINP -->|"OpenAI-compatible /v1"| PROXY
    PROXY <-->|p2p| PEERS
    PROXY -->|settles USDC| BASE
    WORKER -->|bridges G$→USDC| BASE
    CELO -->|G$ deposits| WORKER
    BRAINP -->|"tools: /host status,<br/>/api verify, Celo reads"| HOST
```

Package map:

| Package | Role |
| --- | --- |
| `packages/agent-brain` | Brain runtime: orchestrator, LLM client, memory, Telegram channel, tools |
| `packages/runtime` | Deploy pipeline: wallet, skills, **brain-provision.ts**, PM2 ecosystem |
| `packages/db` | Prisma models; brain config + encrypted token on `DeployedAgent` |
| `apps/host` | Host API on the VPS: deploy CRUD, status (incl. brain), pause/resume |
| `apps/web` | Wizard (enable-chat toggle) + dashboard (chat status chip) |
| `scripts/setup-antseed-vps.sh` | Installs/configures the AntSeed buyer proxy on the VPS |
| `scripts/deploy-host-vps.sh` | Syncs runtime + agent-brain + host to the VPS, sets `BRAIN_LLM_BASE_URL`, `BRAIN_DEFAULT_MODEL` |

---

## 3. Deploy flow — how a brain is born

What happens when a user enables AI chat in the wizard.

```mermaid
sequenceDiagram
    actor U as Operator (wallet)
    participant W as Deploy wizard
    participant H as Host API
    participant DB as Postgres
    participant P as Pipeline (runtime)
    participant TG as Telegram getMe
    participant PM as PM2

    U->>W: pick skills, toggle "Enable AI chat", paste BotFather token
    W->>H: POST /deploy { skills, brain: { enabled, botToken, model? } }
    H->>H: encrypt token (AES, DEPLOY_ENC_SECRET)
    H->>DB: create DeployedAgent<br/>brainConfig JSON + brainBotTokenEnc
    H->>P: runDeployPipeline(deployId)
    P->>P: provision wallet + install skills
    P->>TG: validate token via getMe
    TG-->>P: bot username (e.g. actionorder_bot)
    P->>P: provisionBrain() — write persona.md,<br/>knowledge/*.md, brain-manifest.json
    P->>P: writeEcosystemConfig() with 2 apps
    P->>PM: start ga-<id> and ga-brain-<id>
    P-->>H: result { brainBotUsername }
    H->>DB: persist botUsername into brainConfig
    W->>H: GET /deploy/:id/status
    H-->>W: { brain: { enabled, botUsername, pm2: online } }
    Note over W: Dashboard shows "Chat: Online · @actionorder_bot"
```

Failure isolation rules baked into the pipeline:

- Bad bot token → the deploy **fails fast** at `validateTelegramBotToken`,
  before any PM2 process starts.
- Pause/resume and stop/start manage **both** processes
  (`ga-<id>` and `ga-brain-<id>`) together.
- The public API strips `brainBotTokenEnc`; the token is only ever decrypted
  inside the pipeline to inject into the brain's PM2 env.

---

## 4. Chat request flow — a message, end to end

```mermaid
sequenceDiagram
    actor U as Telegram user
    participant T as Telegram
    participant B as ga-brain-&lt;id&gt;<br/>(agent-brain)
    participant M as Session memory<br/>(brain-memory/)
    participant X as AntSeed buyer proxy<br/>localhost:8377/v1
    participant PR as Provider peer
    participant HO as Host API / Celo

    U->>T: "how are your games going today?"
    T->>B: update (long-poll)
    B->>M: load session history
    B->>X: POST /v1/chat/completions<br/>(persona + knowledge + history + tools)
    X->>PR: p2p inference request
    PR-->>X: tool_call: agent_stats
    X-->>B: tool_call: agent_stats
    B->>HO: GET /deploy/:id/status (live record, balance)
    HO-->>B: { record: 187-219, today: 88, ... }
    B->>X: tool result → second completion
    X->>PR: continue
    PR-->>X: final text
    X-->>B: "Played 88 matches today, 187 wins overall…"
    B->>B: stripMarkdown() — Telegram-safe plain text
    B->>M: append turns
    B->>T: sendMessage
    T->>U: reply
```

Tool contract (all read-only):

| Tool | What it does | Backed by |
| --- | --- | --- |
| `agent_stats` | Live match record, balance, uptime for this deploy | Host status API |
| `verify_address` | Is this address a human-backed GoodAgent? | GoodAgent verify (Celo) |
| `check_claim_eligibility` | Can this wallet claim UBI now? | UBIScheme on Celo |

Chat is deliberately **read-only company**: the brain cannot move funds,
place bets, or reconfigure the agent. Guardrails live in the generated
persona (no model self-identification, plain text only, English by default,
never ask for seed phrases) plus `stripMarkdown()` on every outbound message.

---

## 5. Funding flow — G$ in, inference out

AntSeed settles in USDC on Base, but users only ever touch G$. The GoodDollar
AntSeed integration bridges between the two.

```mermaid
flowchart LR
    OP(("Operator<br/>G$ on Celo")) -->|"transferAndCall<br/>(min first deposit $1)"| VAULT["CeloGdAntSeedVault<br/>(Celo)"]
    VAULT -->|deposit event| WORKER["GoodDollar AntSeed Worker<br/>(Cloudflare)"]
    WORKER -->|"swap + bridge<br/>G$ → USDC"| DEP["AntseedDeposits<br/>(Base)"]
    WORKER -->|"credit ledger<br/>(G$-denominated,<br/>GoodID bonus)"| CREDITS[("Compute credits")]
    DEP -->|balance| BUYER["AntSeed buyer identity<br/>~/.antseed/identity.key (VPS)"]
    BUYER --> PROXY["buyer proxy :8377"]
    PROXY -->|"pay per request"| PEERS["Provider peers"]
    PEERS -->|inference| PROXY

    style OP fill:#2b1f05,stroke:#e6b23c,color:#eceff3
```

One-time consent: the buyer signs an EIP-712 `SetOperator` message so the
GoodDollar operator may deposit on its behalf (`NotDepositsOperator` guard on
Base).

### Three stores of value — don't confuse them

```mermaid
flowchart TB
    A["1 · Identity bond<br/>250 G$ locked in AgentVault (Celo)<br/>refundable · backs the Agent ID"]
    B["2 · Skill wallet<br/>agent's own G$ for wagers<br/>capped by per-skill loss limits"]
    C["3 · Compute credits<br/>G$ deposited for inference<br/>spent per token via AntSeed"]
    A ~~~ B ~~~ C
```

Pulling the bond kills the identity. Emptying the skill wallet stops wagers.
Exhausting credits silences the brain. Each is independent by design.

---

## 6. On-disk anatomy of a brain-enabled deploy

```text
~/goodagent-agents/<deployId>/
├── ecosystem.config.cjs        # PM2: ga-<id> + ga-brain-<id>
├── brain-manifest.json         # model, channels, persona/knowledge paths, tools
├── brain/
│   ├── persona.md              # generated system prompt (preset: gaming|assistant)
│   └── knowledge/
│       ├── gooddollar-ubi.md   # UBI facts (claim window, GoodID, gooddapp.org)
│       └── scam-patterns.md    # scam heuristics the bot warns about
├── brain-memory/               # rolling per-chat session history
├── logs/                       # skill + brain out/err logs
└── skills/...                  # installed skill runtimes
```

PM2 processes per deploy:

| Process | Runs | Env (highlights) |
| --- | --- | --- |
| `ga-<deployId>` | skill runtime (games, reminders) | agent wallet key, skill config |
| `ga-brain-<deployId>` | `@goodagent/agent-brain` CLI | `TELEGRAM_BOT_TOKEN` (decrypted), `BRAIN_LLM_BASE_URL=http://localhost:8377/v1`, `BRAIN_MODEL`, `GOODAGENT_HOST_URL`, `BRAIN_MEMORY_DIR`, `API_BASE` |

Shared VPS process: `antseed-buyer` (one proxy serves all brains).

---

## 7. Data model

`DeployedAgent` additions (Prisma):

```prisma
model DeployedAgent {
  // ...existing fields...
  brainConfig      String?  @map("brain_config")        @db.Text  // JSON
  brainBotTokenEnc String?  @map("brain_bot_token_enc") @db.Text  // AES-encrypted
}
```

`brainConfig` JSON shape (`DeployBrainConfig`):

```json
{
  "enabled": true,
  "model": "deepseek-v4-flash",
  "personaPreset": "gaming",
  "tools": ["verify_address", "check_claim_eligibility", "agent_stats"],
  "botUsername": "actionorder_bot"
}
```

Host API surface:

| Endpoint | Brain behaviour |
| --- | --- |
| `POST /deploy` | accepts `brain { enabled, botToken, model?, personaPreset?, tools? }`; encrypts token at rest |
| `GET /deploy/:id/status` | returns `brain { enabled, model, botUsername, pm2 }` for the dashboard |
| pause / resume / stop / start | operate on the skill **and** brain processes together |

---

## 8. Why this architecture matters

1. **Bots → agents.** Skills alone are scripted loops. With perception
   (messages, live stats), reasoning (LLM planning), and action (tool calls),
   the deploy satisfies the real perceive–reason–act agent loop.
2. **Accountable AI.** Every brain hangs off a GoodAgent ID: a face-verified
   human vouched on-chain and locked a refundable 250 G$ bond. "Who is
   responsible for this bot?" has a verifiable answer.
3. **UBI-powered cognition.** No OpenAI key anywhere. Inference is bought
   with G$ — the same currency the agents serve — through a permissionless
   P2P network. Anyone GoodDollar-verified can afford an intelligent agent.
4. **Failure isolation.** Two processes, one supervisor. Slow peers never
   cost a game; a crashed skill never kills the conversation.
5. **Productized.** What took hand-rolled SSH surgery for the ACTION-ORDER
   pilot is now a wizard checkbox: persona generation, token encryption, PM2
   wiring and status reporting all happen in the pipeline.
6. **An economic loop, not a cost center.** Credits are per-deploy and
   G$-denominated. The planned "Top up with G$" dashboard flow makes each
   agent a self-funding unit.

## 9. Status and roadmap

| Phase | Item | Status |
| --- | --- | --- |
| 0 | Host–worker credit wiring (profile, record deposit, outstanding) | done |
| 1 | Brain runtime + ACTION-ORDER pilot + claim-reminder bot | done (live) |
| 1.5 | Brain in the deploy pipeline + wizard toggle + dashboard status | done (live) |
| 2 | "Top up with G$" + buyer address QR in dashboard | next |
| 3 | Superfluid G$ stream option for always-on agents | planned |
| 4 | Worker chat proxy → per-message G$ credit spend | planned |
| 5 | Hybrid brain supervising GameArena plugin | planned |
| 6 | AntSeed provider mode (`ant-agent`) — agents sell expertise | planned |
