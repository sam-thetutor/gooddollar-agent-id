# Implementation plan — GoodDollar Agent ID

> **Pivot note.** The project is now **GoodDollar Agent ID** (see `01-project-overview.md`
> and `14-agent-id-spec.md`). The previous "G$ Copilot" claim/send scope is retired as a
> *product*, but its infrastructure is reused as the foundation below. We're repointing
> what's built, not rebuilding from zero.

This plan is **task-level and executable**. Each phase lists concrete tasks (with file
paths and signatures), deliverables, and a **gate** (a demoable acceptance check) you must
pass before moving on. Check boxes as you go and update the status tracker at the bottom.

---

## What we reuse vs build new

| Existing (keep) | Repurposed for Agent ID |
|-----------------|-------------------------|
| `packages/chain` — `getVerifyStatus` already returns `root` + `expiresAt` | The human-root read for issuing/verifying credentials |
| `packages/mcp-server` — `createMcpServer()` + tool switch | Add `issueAgentId` / `verifyAgent` / `getAgentStatus` tools |
| `apps/api` — Hono API + in-process MCP + self-hosted LLM copilot | Add `/agent/*` routes; copilot becomes the on-ramp assistant |
| `apps/mini-app` — MiniPay shell, auto-connect, Wagmi, copilot UI | Add Issue + "My Agents" + public Verify pages |
| `packages/db` — Prisma repositories pattern | Add `AgentCredential` model + repository |
| `packages/shared` — Zod schemas | Add Agent ID schemas |
| VPS deploy (nginx + PM2), `gcopilot.geinz.lol`, `gcopilot-api.geinz.lol` | Same hosting, new product |

| New to build |
|--------------|
| `packages/agent-id` — EIP-712 sign/verify, types, ERC-8004 encoders |
| `packages/contracts` (Phase E) — stake / budget / attestation |
| Mini App pages — Issue, My Agents, public Verify/Explorer |

---

## Retire / archive (from old scope)

- Telegram bot as primary channel → **secondary/optional** (keep code, deprioritize)
- Claim-UBI / transfer / Superfluid *product* flows → **not the product** (chain helpers may stay)

---

## Conventions

- **Package scope:** publishables under `@gooddollar-agent-id/*`; internal stays `@g-copilot/*` for now (rename is non-urgent).
- **Chain:** Celo mainnet (42220). G$ ERC-20 + GoodDollar Identity already wired in `packages/chain`.
- **Non-custodial:** the operator always signs in their own wallet. The server never holds keys.
- **Definition of done per phase:** code + tests + the gate passes + status tracker updated.

---

## Phase A — Credential core (`packages/agent-id`)

**Goal:** Deterministically sign and verify a GoodDollar-rooted Agent ID off-chain. No API, no UI yet — a pure, tested library.

**Tasks**
- [ ] A1. Scaffold package: `packages/agent-id/` (`package.json`, `tsconfig.json`, `src/index.ts`), add to pnpm workspace + turbo build.
- [ ] A2. `src/types.ts` — `AgentIdFields`, `AgentIdCredential` (fields + signature), `VerifyResult`.
- [ ] A3. `src/eip712.ts` — EIP-712 `domain` + `AgentID` typed-data (spec §2): `agent, operator, humanRoot, scopes, stake, budgetCap, nonce, issuedAt, expiresAt`.
- [ ] A4. `src/sign.ts` — `buildAgentId(fields)` (fills issuedAt/nonce defaults) and `hashAgentId(fields)` (typed-data hash for signing).
- [ ] A5. `src/verify.ts` — `verifyAgentId(credential, { now?, humanRootLookup })`:
  - recover signer from signature, must equal `operator`
  - call `humanRootLookup(operator)` → must be non-zero **and** equal `humanRoot`
  - check `now < expiresAt`
  - return `{ valid, operator, humanRoot, scopes, stake, expiresAt, reason }`
- [ ] A6. Wire the live lookup: default `humanRootLookup` adapts `getVerifyStatus` from `@g-copilot/chain` (`root`, treat `null`→zero).
- [ ] A7. Tests (`vitest`): valid · expired · wrong-signer · operator-not-whitelisted · root-mismatch · tampered-fields. Use a local test signer + a stubbed `humanRootLookup`.

**Deliverables:** importable `signAgentId` / `verifyAgentId`; green unit tests.

**Gate:** A test issues a credential for a whitelisted address and `verifyAgentId` returns `valid:true`; flipping the lookup to zero (or changing a field) returns `valid:false` with a clear `reason`.

---

## Phase B — API + MCP surface

**Goal:** Expose issue/verify over REST and MCP, backed by persistence.

**Tasks**
- [ ] B1. `packages/shared` — add Zod: `agentIdFieldsSchema`, `issueAgentRequestSchema` (signed credential), `verifyAgentResponseSchema`.
- [ ] B2. `packages/db` — Prisma model `AgentCredential` (`agent` PK/unique, `operator`, `humanRoot`, `scopes`, `stake`, `budgetCap`, `nonce`, `issuedAt`, `expiresAt`, `signature`, `revokedAt?`, timestamps) in the `gcopilot` schema; `db:push`.
- [ ] B3. `packages/db` — repository: `upsertAgentCredential`, `getAgentCredential(agent)`, `revokeAgentCredential(agent)`.
- [ ] B4. `apps/api` — `POST /agent/issue`: validate body, re-verify signature + human root server-side, persist, return stored credential.
- [ ] B5. `apps/api` — `GET /agent/verify/:address`: load credential, run `verifyAgentId` with **live** human-root lookup, return `VerifyResult` (+ `found:false` when none).
- [ ] B6. `apps/api` — `GET /agent/list?operator=` : list an operator's agents (for "My Agents").
- [ ] B7. `packages/mcp-server` — add tools `gooddollar_issue_agent_id`, `gooddollar_verify_agent`, `gooddollar_get_agent_status` to `createMcpServer()` switch + `ListTools`.
- [ ] B8. Copilot wiring (`apps/api/src/lib/agent.ts`): let the copilot answer "is agent X human-backed?" via the new verify tool.

**Deliverables:** working REST + MCP issue/verify backed by Postgres.

**Gate:** `curl -X POST .../agent/issue` (with a signed credential) persists; `curl .../agent/verify/<agent>` returns correct JSON; the same verify works through the MCP tool.

---

## Phase C — MiniPay issue flow

**Goal:** A verified human mints an Agent ID end-to-end in MiniPay, non-custodially.

**Tasks**
- [ ] C1. `apps/mini-app/src/lib/api.ts` — add `issueAgent`, `verifyAgent`, `listAgents` clients + types.
- [ ] C2. Verify gate component: read `getVerifyStatus(connected)`; if not whitelisted, surface a "Verify with GoodDollar" CTA that launches `generateFVLink` (Identity SDK) and polls status.
- [ ] C3. `apps/mini-app/src/pages/IssueAgent.tsx` — form: agent address, scopes (multiselect: pay/trade/post/custom), expiry, (optional) stake + budget cap.
- [ ] C4. EIP-712 signing in MiniPay via Wagmi `signTypedData` using the `agent-id` typed-data; submit to `POST /agent/issue`.
- [ ] C5. Success screen: show credential + a shareable verify link (`/verify?agent=...`).
- [ ] C6. Routing + Home dashboard entry ("Create Agent ID" / "My Agents"); add route in `App.tsx`.

**Deliverables:** in-app issue flow producing a persisted, verifiable credential.

**Gate:** On a real device in MiniPay: connect → (verify if needed) → fill form → sign → credential created and `GET /agent/verify/<agent>` returns `valid:true`.

---

## Phase D — Public Explorer / Verify page

**Goal:** Anyone (no wallet) can verify any agent.

**Tasks**
- [ ] D1. `apps/mini-app/src/pages/Verify.tsx` — input an agent address (or read `?agent=`); call `GET /agent/verify/:address`.
- [ ] D2. Status card UI: human-backed badge, operator (truncated), human root, scopes, stake, budget remaining, expiry, last-checked.
- [ ] D3. Clear negative states: not found · expired · operator no longer verified (with reason).
- [ ] D4. Shareable/OG-friendly route; link from issue success + Home.

**Deliverables:** public verify page usable by third parties.

**Gate:** Open `/verify?agent=<addr>` in a normal browser (no wallet) and see the correct live status, including a correct *negative* when the operator isn't verified.

> **Milestone — end of D:** a complete, demoable, non-custodial product (issue + verify in MiniPay + public Explorer) on off-chain credentials + existing infra. This is the strongest thing to show for the application/early milestones.

---

## Phase E — G$ stake + delegated budget (`packages/contracts`)

**Goal:** On-chain accountability (stake) + capped, revocable agent spend (budget).

**Tasks**
- [ ] E1. Scaffold `packages/contracts` (Foundry or Hardhat) targeting Celo.
- [ ] E2. `AgentVault` contract: `stake(agent, amount)`, `withdrawStake(agent)` (cooldown), `setBudget(agent, cap)`, `spend(agent, to, amount)` (only within cap), `revoke(agent)` (nonce bump). G$ via ERC-20 `transferFrom`/allowance.
- [ ] E3. Tests for stake/budget/spend/revoke + over-cap rejection.
- [ ] E4. Deploy to Celo (testnet first, then mainnet); record address in `packages/chain/addresses`.
- [ ] E5. Reads in `packages/chain`: `getAgentStake(agent)`, `getAgentBudget(agent)`.
- [ ] E6. Verify path includes `stake` + `budgetRemaining`; "My Agents" management: top up budget, increase stake, revoke (Wagmi writes in MiniPay).

**Deliverables:** on-chain stake + budget wired into issue/verify/manage.

**Gate:** Operator stakes G$ and sets a budget; `verify` reflects `stake`/`budgetRemaining`; a spend within cap succeeds and over-cap reverts; revoke invalidates the credential.

---

## Phase F — ERC-8004 Tier 1 + publish

**Goal:** Interoperability with the Celo agent stack + a shippable SDK.

**Tasks**
- [ ] F1. `packages/agent-id/src/erc8004.ts` — encode the GoodDollar credential into ERC-8004 agent metadata; a reader that extracts + verifies it.
- [ ] F2. Read/cross-check against the Celo ERC-8004 Identity Registry (`0x8004…a432`).
- [ ] F3. Package SDK for publish: clean exports, README, `@gooddollar-agent-id/sdk` + MCP to npm.
- [ ] F4. Integration example: a standalone script (Claude/Cursor/agent framework) that installs the SDK and verifies a live agent.
- [ ] F5. Docs: quickstart in `docs/` + npm READMEs.

**Deliverables:** published SDK + MCP; ERC-8004-readable credentials; an external integration example.

**Gate:** A fresh external script installs the SDK and verifies a live agent in under 10 minutes.

---

## Build order & milestones

```
A ─▶ B ─▶ C ─▶ D   ⇒  demoable product (off-chain, MiniPay + Explorer)   ← application milestone
              └▶ E ─▶ F   ⇒  on-chain G$ mechanics + ERC-8004 + npm
```

| GoodBuilders week | Target | Maps to |
|---|---|---|
| 4 | Verify → issue Agent ID; `verifyAgent` API live | A + B (+ start C) |
| 8 | Stake + budget; public Explorer; 50 agents · 100 verifications | C + D + E |
| 12 | ERC-8004 Tier 1; SDK + MCP on npm; 200 agents · 1 integration | F |

---

## Current status tracker

| Phase | Status | Notes |
|-------|--------|-------|
| A Credential core | ⬜ Not started | `packages/agent-id` (pure lib + tests) |
| B API + MCP | ⬜ Not started | `/agent/issue`, `/agent/verify/:addr`, MCP tools, Prisma model |
| C MiniPay issue | ⬜ Not started | verify gate + sign + persist |
| D Explorer/Verify | ⬜ Not started | public verify page |
| E Stake + budget | ⬜ Not started | `packages/contracts` |
| F ERC-8004 + npm | ⬜ Not started | publish + example |

Legend: ⬜ Not started · 🔄 In progress · ✅ Gate passed

---

## Next action

**Start Phase A** → scaffold `packages/agent-id` and implement the EIP-712 credential +
`verifyAgentId`, reusing `getVerifyStatus` from `packages/chain` for the human-root read.
Pass the Phase A gate (green tests) before touching the API.
