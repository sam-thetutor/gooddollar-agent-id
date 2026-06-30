# GoodDollar Agent ID — Documentation

**GoodDollar Agent ID** is the passport-free **Proof-of-Human layer for AI agents**. It lets any [GoodDollar](https://gooddollar.org) face-verified human cryptographically vouch for their AI agents — issuing a verifiable, identity-only credential that plugs into the **ERC-8004** agent trust standard on Celo, backed by a **required, refundable G$ bond** (≥ 250 G$).

Built for [GoodBuilders Season 4](https://ubi.gd/goodbuilders).

---

## Start here

| Document | Description |
|----------|-------------|
| [**Pitch deck**](./15-pitch-deck.md) | Slide-by-slide: why GoodDollar Agent ID is required and why it matters |
| [**Project overview**](./01-project-overview.md) | Vision, problem, uniqueness vs Self, GoodBuilders alignment |
| [**Agent ID spec**](./14-agent-id-spec.md) | EIP-712 credential, verify algorithm, ERC-8004 tiers, G$ mechanics |
| [**Implementation plan**](./13-implementation-plan.md) | Phased build + reuse map (start here for coding) |
| [**GoodBuilders application**](./12-goodbuilders-application.md) | Draft submission text |

## Supporting infrastructure docs

| Document | Description |
|----------|-------------|
| [Architecture](./02-architecture.md) | System design, components, request flows, deployment |
| [Monorepo structure](./03-monorepo-structure.md) | Folder layout and package boundaries |
| [MCP server](./04-mcp-server.md) | `verify_agent` + GoodDollar read tools |
| [Onchain integration](./08-onchain-integration.md) | Identity, AgentVault, ERC-8004 on Celo |
| [Data model](./09-data-model.md) | Persistence (Agent credentials + audit log) |
| [Security](./10-security.md) | Threat model, non-custodial signing rules |

> Roadmap and KPIs now live in the [implementation plan](./13-implementation-plan.md)
> and the [GoodBuilders application](./12-goodbuilders-application.md).

---

## Quick reference

```
Operator (web + MetaMask) ──verify (GoodDollar face)──▶ humanRoot
        │ sign EIP-712 AgentID (non-custodial)
        ▼
   Agent ID credential ──embed──▶ ERC-8004 agent metadata
        ▲                                   │
   verifyAgent(addr)  ◀── SDK / MCP / REST ── Verifier (marketplace, dApp, agent)
```

**Trust rule:** Non-custodial. The human signs in their own wallet; verification
re-reads the GoodDollar whitelist live, so credentials auto-invalidate if a human's
verification lapses. Signing is free; registering an agent requires a refundable G$
bond (≥ 250 G$), the bond is revocable after a cooldown, and each human can vouch for
at most 10 active agents.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Credential | EIP-712, Viem, `@goodsdks/citizen-sdk` |
| SDK / MCP | TypeScript, `@modelcontextprotocol/sdk` |
| Contracts | Solidity — `AgentVault` (required refundable bond, stake-only) |
| API | Node.js, Hono, Prisma + Postgres |
| App | Vite, React, Wagmi v3, Reown AppKit (MetaMask + multi-wallet) |
| Chain | Celo mainnet (42220), ERC-8004 registry `0x8004…a432` |
| Hosting | Web on **Vercel** (`gooddollar-agent-id.vercel.app`); API on **VPS** nginx + PM2 (`gcopilot-api.geinz.lol`); npm: `@goodagent/agent-id`, `@goodagent/mcp-server` |

---

## Getting started

See [Implementation plan](./13-implementation-plan.md) → **Phase A** to begin building
`packages/agent-id`. Local run instructions live in the root `README.md`.
