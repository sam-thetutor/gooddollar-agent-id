# GoodDollar Agent ID — Documentation

**GoodDollar Agent ID** is the passport-free **Proof-of-Human layer for AI agents**. It lets any [GoodDollar](https://gooddollar.org) face-verified human cryptographically vouch for their AI agents — issuing a verifiable credential that plugs into the **ERC-8004** agent trust standard on Celo, with **G$** as the agent's accountability stake and capped spending budget.

Built for [GoodBuilders Season 4](https://ubi.gd/goodbuilders).

> **Pivot note.** This project evolved from "G$ Copilot." The copilot now serves as the
> human on-ramp; the product is the Agent ID layer. Some docs below (04–11) describe
> reusable infrastructure from that earlier scope — see the implementation plan's reuse map.

---

## Start here

| Document | Description |
|----------|-------------|
| [**Pitch deck**](./15-pitch-deck.md) | Slide-by-slide: why GoodDollar Agent ID is required and why it matters |
| [**Project overview**](./01-project-overview.md) | Vision, problem, uniqueness vs Self, GoodBuilders alignment |
| [**Agent ID spec**](./14-agent-id-spec.md) | EIP-712 credential, verify algorithm, ERC-8004 tiers, G$ mechanics |
| [**Implementation plan**](./13-implementation-plan.md) | Phased build + reuse map (start here for coding) |
| [**GoodBuilders application**](./12-goodbuilders-application.md) | Draft submission text |

## Supporting / reused infrastructure docs

| Document | Description |
|----------|-------------|
| [Architecture](./02-architecture.md) | System design, components, data flows |
| [Monorepo structure](./03-monorepo-structure.md) | Folder layout and package boundaries |
| [MCP server](./04-mcp-server.md) | Tool definitions and MCP protocol |
| [Telegram bot](./05-telegram-bot.md) | Secondary channel (deprioritized) |
| [Mini App](./06-telegram-mini-app.md) | MiniPay app shell + signing UI |
| [Wallet connection](./07-wallet-connection.md) | MiniPay injected provider + fallbacks |
| [Onchain integration](./08-onchain-integration.md) | GoodDollar SDK, Celo |
| [Data model](./09-data-model.md) | Persistence |
| [Security](./10-security.md) | Threat model, signing rules |
| [Roadmap & milestones](./11-roadmap-milestones.md) | KPIs |

---

## Quick reference

```
Operator (MiniPay) ──verify (GoodDollar face)──▶ humanRoot
        │ sign EIP-712 AgentID (non-custodial)
        ▼
   Agent ID credential ──embed──▶ ERC-8004 agent metadata
        ▲                                   │
   verifyAgent(addr)  ◀── SDK / MCP / REST ── Verifier (marketplace, dApp, agent)
```

**Trust rule:** Non-custodial. The human signs in their own wallet; verification
re-reads the GoodDollar whitelist live, so credentials auto-invalidate if a human's
verification lapses. Agents only spend within a capped, revocable G$ budget.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Credential | EIP-712, Viem, `@goodsdks/citizen-sdk` |
| SDK / MCP | TypeScript, `@modelcontextprotocol/sdk` |
| Contracts (Tier 2) | Solidity — stake / budget / attestation |
| API | Node.js, Hono, Prisma + Postgres |
| App | Vite, React, Wagmi v2, MiniPay injected provider |
| Copilot LLM | Self-hosted Ollama (OpenAI-compatible), swappable |
| Chain | Celo mainnet (42220), ERC-8004 registry `0x8004…a432` |
| Hosting | VPS — nginx + PM2 (`gcopilot.geinz.lol`, `gcopilot-api.geinz.lol`) |

---

## Getting started

See [Implementation plan](./13-implementation-plan.md) → **Phase A** to begin building
`packages/agent-id`. Local run instructions live in the root `README.md`.
