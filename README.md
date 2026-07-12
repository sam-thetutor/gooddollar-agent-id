<p align="center">
  <img src="assets/logo.png" alt="GoodDollar Agent ID" width="160" />
</p>

# GoodDollar Agent ID

The passport-free **Proof-of-Human layer for AI agents** — powered by [GoodDollar](https://gooddollar.org) on Celo. Built for [GoodBuilders Season 4](https://ubi.gd/goodbuilders).

## What it is

**GoodDollar Agent ID** lets any GoodDollar **face-verified human** cryptographically vouch for their AI agents — issuing a verifiable, identity-only **Proof-of-Human credential** that plugs into the **ERC-8004** agent trust standard on Celo, backed by a **required, refundable G$ bond** (≥ 250 G$).

- **Agent ID SDK + MCP** — `signAgentId` / `verifyAgentId`: GoodDollar-rooted EIP-712 agent credentials any agent or app can use, plus a deployed ERC-8004 `IHumanProofProvider`.
- **Web app (MetaMask)** — the human on-ramp: connect → face-verify → stake the refundable bond → mint an Agent ID, all signed non-custodially.
- **Public Explorer** — verify any agent: human-backed? root, expiry, and its on-chain G$ bond.

The agent never holds the operator's keys. The human signs in their own wallet; signing is free, the required G$ bond is self-custodied in the vault and fully refundable, and each human can vouch for at most 10 active agents.

## The problem it solves

Celo's agent stack (ERC-8004 + Self Agent ID + Agent Visa) roots agent identity in **biometric passports / Aadhaar** — excluding the hundreds of millions of document-less people GoodDollar serves. So GoodDollar's ≈900K face-verified humans are **locked out of the agent economy**.

GoodDollar Agent ID adds the missing piece: a **passport-free, GoodDollar-rooted** Proof-of-Human provider that implements the *same* ERC-8004 `IHumanProofProvider` interface Self uses — deployed on Celo and ready for any `IERC8004ProofOfHuman` registry to adopt. Additive, not competitive.

## Who it's for

| Segment | What they get |
|---------|---------------|
| GoodDollar-verified humans (operators) | Stand behind their agents without a passport; lock a refundable G$ bond to register them |
| Agent builders | Drop-in passport-free Proof-of-Human for their agents |
| Verifiers (marketplaces, dApps, agents) | Check an agent is human-backed before trusting/paying it |

## How it works

```
Operator (web + MetaMask) ──verify (GoodDollar face)──▶ humanRoot
        │ sign EIP-712 AgentID (non-custodial)
        ▼
   Agent ID credential ──embed──▶ ERC-8004 agent metadata
        ▲                                   │
   verifyAgent(addr) ◀── SDK / MCP / REST ── Verifier
```

## The rules

Every Agent ID obeys seven rules, all enforced by live on-chain reads — never a
cached snapshot:

1. **Agent-consented.** An address can only be registered after its key attests
   in the on-chain `AgentAttestation` registry (or supplies a fresh agent-signed
   proof at issue). The agent consents first, then the human vouches — squatted
   registrations are rejected at the door with `AGENT_NOT_ATTESTED`.
2. **Human-rooted.** Only a currently-verified GoodDollar human can vouch for an
   agent, signing an EIP-712 credential in their own wallet (free, non-custodial).
   If the human's verification lapses, the credential auto-invalidates.
3. **Bond-backed for life.** Registering an agent requires locking a **refundable
   G$ bond ≥ 250 G$** in `AgentVault` — and it must stay locked while the agent is
   active. Every verification re-reads the vault: withdraw below the minimum and
   the agent fails with `insufficient_bond` until re-staked. **Withdrawing the
   bond is how an operator un-vouches an agent.**
4. **Revocable on-chain.** The operator can flip a kill switch in the
   `AgentRevocation` registry; every verifier reads it live and the agent fails
   with `revoked` — no dependency on our API.
5. **Always refundable.** The bond only ever returns to the operator (3-day
   cooldown, self-custodied in the vault) — it is a deposit, never a fee.
6. **Capped fan-out.** One human can vouch for at most **10 active agents**.
7. **Not a bearer token.** A credential proves a human vouches for an agent
   *address* — it does not prove the presenter controls it. Counterparties are
   authenticated with a fresh, agent-signed `AgentAuth` challenge
   (`POST /agent/verify-auth`, or `verifyAgentAuth` in the SDK).

## Status

**GoodDollar Agent ID** — credential core, contract, API/MCP, website, and ERC-8004
interop are all in place (Phases A–F code-complete):

- **A** ✅ `packages/agent-id` — EIP-712 sign/verify with live human-root check (viem-only SDK)
- **B** ✅ API (`/agent/issue`, `/agent/verify/:address`, `/agent/list`) + MCP `gooddollar_verify_agent`
- **C/D** ✅ Website (MetaMask via Reown AppKit): stake bond, issue, My Agents, manage, public Explorer
- **E** ✅ `AgentVault` — required, refundable G$ bond with on-chain `minStake` (250 G$) **live on Celo mainnet** [`0x040904…7090`](https://celoscan.io/address/0x0409042B55e99Df8c0Feb7525A770838f3A47090)
- **F** ✅ ERC-8004 interop (encode/verify registration; registry reads) + SDK + MCP on npm (`@goodagent/agent-id`, `@goodagent/mcp-server`) + example
- **G** ✅ `GoodDollarHumanProofProvider` — a deployed ERC-8004 `IHumanProofProvider` reading the live GoodDollar whitelist **live on Celo mainnet** [`0x80c4…48c9`](https://celoscan.io/address/0x80c4de6872049cb20989156bca50134c781f48c9)
- **H** ✅ `AgentRevocation` — on-chain operator kill switch read live by every verifier, **live on Celo mainnet** [`0xA86a…2137`](https://celoscan.io/address/0xA86a133626989115a6499b6cA67c3c8dA1662137); plus agent proof-of-possession (`AgentAuth`) so credentials can't be replayed by impersonators
- **I** ✅ `AgentAttestation` — on-chain agent key proof-of-possession (direct `attest()` or gasless relayed `attestFor`), **live on Celo mainnet** [`0xe5EF…f6C2`](https://celoscan.io/address/0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2); surfaced as `agentProven` in every verify

The credential is **identity-only** (the signed struct carries no money fields). To
register an agent the operator must lock a **refundable G$ bond ≥ 250 G$** (enforced
on-chain via `minStake` and at `/agent/issue`), a single human can vouch for at most 10
active agents, and the bond is read live from the vault **on every verification** — if
the operator withdraws below the minimum, the agent fails verification with
`insufficient_bond` until the bond is re-staked (withdrawing is how an operator
un-vouches an agent). See
[docs/13-implementation-plan.md](./docs/13-implementation-plan.md).

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
  api/            HTTP API (Hono) — /agent/* issue & verify
  web/            Vite + React website — MetaMask via Reown AppKit
                  (issue, My Agents, public verify)
packages/
  shared/         Constants, Zod, errors
  chain/          Viem Celo client + GoodDollar identity reads
  db/             Prisma schema
  mcp-server/     MCP tools (issueAgentId, verifyAgent, ...)
  agent-id/       EIP-712 credential sign/verify + ERC-8004
  contracts/      AgentVault — required refundable G$ bond (stake-only)
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

Live Celo contracts: G$ `0x62B8…9c7A` · Identity `0xC361…2F42` · AgentVault `0x040904…7090` · GoodDollarHumanProofProvider `0x80c4…48c9` · ERC-8004 Identity Registry `0x8004…a432`.
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





here is how it works. 

when the owner of the agent signs a transaction to verify and back their agent. at this point the agent becomes verified. for the number of days that the owner specifies.

the staking comes in to cater for scenarios where lets say a certain platform using our identity project wants to limit agents that are bots. they can put a requirement that any agent to participate in their program must maintain a certain stake amount 

Hello Hadar, greetings to you.
regarding your inquiries,

We are building an infrastructure project for the AI on good dollar. With the announcement in season four that was inviting ai agent proejcts. we realized that there is no common standard that ai agents can use to veirfy themselves since most of them will come from different chains. So our goal is to become the common ai agent identity standard on Good dollar so that any agent from anychain that wants to plug into Good dollar ecosystem has a way of being identified.



First, the big picture. We are building for the future of AI agents on GoodDollar.Our goal is to aolve the Ai agent identity fragmentation that is there right now on Good dollar. Right now, there is no standard way of identify and veirifying Ai agents on Good dollar and AI agents are multiplying fast, and very soon we are getting Ai platforms on Good dollar with the recent announcement from season 4 regarding AI agent projects. These pplatforms will start asking the same question about every bot: "who is behind this thing?" just like app stores require developer accounts and payment companies require ID. We're building that answer now, before it becomes a requirement, using GoodDollar's biggest strength: over 900,000 real, face-verified humans.

How does an agent benefit from being verified? A verified agent can prove there is a real human standing behind it, with real money (a 250 G$ deposit) locked as a promise of good behavior. Anyone can check this in seconds. As platforms start requiring some form of agent ID, verified agents get in as the anonymous ones get blocked, rate-limited, or ignored. Verification becomes the agent's ticket to be trusted and to do business.

How do we plan to attract agents? By making it ridiculously easy for the developers who build them. Our tools are published where developers already work (npm), verification can be added to an agent in minutes, and our docs are written so simply that an AI agent can read them and register itself. The deposit is fully refundable, so it costs nothing to join. We will also target the other AI agent projects joining Season 4 directly, they all need identity for their agents, and we are offering it ready-made.

Why would users want verified agents, and how do we attract users? Would you let a stranger's bot handle your money or your tasks? Users want to know someone real is accountable, and that they lose something if their bot misbehaves. A verified agent gives both; an anonymous one just disappears when things go wrong. We don't expect users to come to us, we bring the checkmark to them: a public explorer where anyone can paste an address and get a plain answer, badges that verified agents display wherever they operate, and partnerships with agent marketplaces so "human-backed" becomes a filter users pick, like choosing a highly-rated seller.




Hey Hadar, you are right and I will admit it I was assuming demand. Selfclaw isn't taking off as it had been hyped, but still there are some agents that used it and still do. 

So let me change the approach and build on demand that already exists instead.

GoodDollar already has 100k+ weekly active users, and they have real problems today: figuring out claiming, checking if an address is safe before sending G$, getting scammed by impersonators, basic onboarding questions. My plan for the season is to build 2 assistant agents that solve exactly those problems and put them in the community telegram where the users already are. they will both be live by end of tihs week. Both of them verified and bonded through the infra I already built — so the trust layer becomes something users actually touch instead of theory waiting for a market.

Everything stays measurable the way season 4 scores things anyway: users helped, G$ locked in the bonds, all public on my explorer, so you can check progress anytime without asking me.

On "even if we had agents it would only be a few" — honestly a few is all I wouldd need at this stage. Not asking for a market, just a handful of design partners. If a few show up during the season I will build around what they actually need, and if they don't, the plan above doesn't depend on them at all.

And if the numbers aren't there by mid season, cut my stream. That's what the streaming model is for. Rather be judged on what I ship to existing users than on my predictions.
