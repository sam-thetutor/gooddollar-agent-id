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
| `apps/web` (was `apps/mini-app`) — Vite + React + Wagmi | Real website; **MetaMask via Reown AppKit** (multi-wallet); Issue + "My Agents" + public Verify pages |
| `packages/db` — Prisma repositories pattern | Add `AgentCredential` model + repository |
| `packages/shared` — Zod schemas | Add Agent ID schemas |
| Hosting: API on VPS (nginx + PM2, `gcopilot-api.geinz.lol`); web on Vercel (`gooddollar-agent-id.vercel.app`) | Reused API host, new product |

| New to build |
|--------------|
| `packages/agent-id` — EIP-712 sign/verify, types, ERC-8004 encoders |
| `packages/contracts` — `AgentVault` optional G$ stake (stake-only) |
| Web app pages (`apps/web`) — Issue, My Agents, public Verify/Explorer, Manage |

---

## Retire / archive (from old scope)

- Telegram bot as primary channel → **secondary/optional** (keep code, deprioritize)
- Claim-UBI / transfer / Superfluid *product* flows → **not the product** (chain helpers may stay)

---

## Conventions

- **Package scope:** publishables under `@gooddollar-agent-id/*`; internal stays `@goodagent/*` for now (rename is non-urgent).
- **Chain:** Celo mainnet (42220). G$ ERC-20 + GoodDollar Identity already wired in `packages/chain`.
- **Non-custodial:** the operator always signs in their own wallet. The server never holds keys.
- **Definition of done per phase:** code + tests + the gate passes + status tracker updated.

---

## Phase A — Credential core (`packages/agent-id`)

**Goal:** Deterministically sign and verify a GoodDollar-rooted Agent ID off-chain. No API, no UI yet — a pure, tested library.

**Tasks**
- [x] A1. Scaffold package: `packages/agent-id/` (`package.json`, `tsconfig.json`, `src/index.ts`), add to pnpm workspace + turbo build.
- [x] A2. `src/types.ts` — `AgentIdFields`, `AgentIdCredential` (fields + signature), `VerifyResult`.
- [x] A3. `src/eip712.ts` — EIP-712 `domain` + `AgentID` typed-data (spec §2): `agent, operator, humanRoot, scopes, stake, budgetCap, nonce, issuedAt, expiresAt`.
- [x] A4. `src/sign.ts` — `buildAgentId(fields)` (fills issuedAt/nonce defaults) and `hashAgentId(fields)` (typed-data hash for signing).
- [x] A5. `src/verify.ts` — `verifyAgentId(credential, { now?, humanRootLookup })`:
  - recover signer from signature, must equal `operator`
  - call `humanRootLookup(operator)` → must be non-zero **and** equal `humanRoot`
  - check `now < expiresAt`
  - return `{ valid, operator, humanRoot, scopes, stake, expiresAt, reason }`
- [x] A6. Wire the live lookup: default `humanRootLookup` adapts `getVerifyStatus` from `@goodagent/chain` (`root`, treat `null`→zero).
- [x] A7. Tests (`vitest`): valid · expired · wrong-signer · operator-not-whitelisted · root-mismatch · tampered-fields. Use a local test signer + a stubbed `humanRootLookup`.

**Deliverables:** importable `signAgentId` / `verifyAgentId`; green unit tests.

**Gate:** A test issues a credential for a whitelisted address and `verifyAgentId` returns `valid:true`; flipping the lookup to zero (or changing a field) returns `valid:false` with a clear `reason`.

---

## Phase B — API + MCP surface

**Goal:** Expose issue/verify over REST and MCP, backed by persistence.

**Tasks**
- [x] B1. `packages/shared` — add Zod: `agentIdFieldsSchema`, `issueAgentRequestSchema` (signed credential), `verifyAgentResponseSchema`.
- [x] B2. `packages/db` — Prisma model `AgentCredential` (`agent` PK/unique, `operator`, `humanRoot`, `scopes`, `stake`, `budgetCap`, `nonce`, `issuedAt`, `expiresAt`, `signature`, `revokedAt?`, timestamps) in the `gcopilot` schema; `db:push`.
- [x] B3. `packages/db` — repository: `upsertAgentCredential`, `getAgentCredential(agent)`, `revokeAgentCredential(agent)`.
- [x] B4. `apps/api` — `POST /agent/issue`: validate body, re-verify signature + human root server-side, persist, return stored credential.
- [x] B5. `apps/api` — `GET /agent/verify/:address`: load credential, run `verifyAgentId` with **live** human-root lookup, return `VerifyResult` (+ `found:false` when none).
- [x] B6. `apps/api` — `GET /agent/list?operator=` : list an operator's agents (for "My Agents").
- [x] B7. `packages/mcp-server` — add `gooddollar_verify_agent` (verifies a passed credential, or looks up by `agent` address via an injectable `agentLookup`) to `createMcpServer()`. (Issuing stays a wallet/API action — not an MCP tool, since it needs the operator's signature; status is the address branch of verify.)
- [x] B8. Copilot wiring (`apps/api/src/lib/agent.ts`): `createMcpServer({ agentLookup })` backed by the DB, so the copilot can answer "is agent X human-backed?" via the verify tool.

**Deliverables:** working REST + MCP issue/verify backed by Postgres.

**Gate:** `curl -X POST .../agent/issue` (with a signed credential) persists; `curl .../agent/verify/<agent>` returns correct JSON; the same verify works through the MCP tool.

---

> **Frontend pivot (2026-06-29):** dropped MiniPay-first. The frontend is now a
> **standalone website** (`apps/web`) where users connect with **MetaMask** (and
> other wallets) via **Reown AppKit** — works with the current `wagmi@3` + `react@19`
> (RainbowKit/ConnectKit don't support wagmi v3 yet). Telegram/MiniPay code removed.

## Phase C — Issue flow (website + MetaMask)

**Goal:** A verified human mints an Agent ID end-to-end on the website, non-custodially.

**Tasks**
- [x] C1. `apps/web/src/lib/api.ts` — `issueAgent`, `verifyAgent`, `listAgents` clients + types.
- [x] C2. Verify gate: read `getVerifyStatus(connected)`; if not whitelisted, surface a "Verify with GoodDollar" CTA (links to the GoodDollar wallet) and re-check status.
- [x] C3. `apps/web/src/pages/IssueAgent.tsx` — form: agent address, scopes (pay/trade/post/vote), expiry, (optional) stake + budget cap.
- [x] C4. EIP-712 signing via Wagmi `signTypedData` using the `agent-id` typed-data; submit to `POST /agent/issue`.
- [x] C5. Success screen: credential + a shareable verify link (`/verify?agent=...`).
- [x] C6. Routing + Home entry ("Issue an Agent ID" / "My Agents").

**Deliverables:** in-app issue flow producing a persisted, verifiable credential.

**Gate:** In a browser with MetaMask: connect → (verify if needed) → fill form → sign → credential created and `GET /agent/verify/<agent>` returns `valid:true`. (Pending: a live valid-issue run with a GoodDollar-verified wallet.)

---

## Phase D — Public Explorer / Verify page

**Goal:** Anyone (no wallet) can verify any agent.

**Tasks**
- [x] D1. `apps/web/src/pages/Verify.tsx` — input an agent address (or read `?agent=`); call `GET /agent/verify/:address`.
- [x] D2. Status card UI: human-backed badge, operator (truncated), human root, scopes, stake, budget remaining, expiry, last-checked.
- [x] D3. Clear negative states: not found · expired · operator no longer verified (with reason).
- [x] D4. Shareable/OG-friendly route; link from issue success + Home.

**Deliverables:** public verify page usable by third parties.

**Gate:** Open `/verify?agent=<addr>` in a normal browser (no wallet) and see the correct live status, including a correct *negative* when the operator isn't verified.

> **Milestone — end of D:** a complete, demoable, non-custodial product (issue + verify on the website + public Explorer) on off-chain credentials + existing infra. This is the strongest thing to show for the application/early milestones.

---

## Phase E — G$ stake + delegated budget (`packages/contracts`)

**Goal:** On-chain accountability (stake) + capped, revocable agent spend (budget).

**Tasks**
- [x] E1. Scaffold `packages/contracts` (Foundry) targeting Celo — `foundry.toml`, forge-std, workspace `package.json`.
- [x] E2. `AgentVault` contract: `stake(agent, amount)`, `requestUnstake`/`withdrawStake(agent, amount)` (3-day cooldown), `fundBudget(agent, amount)`, `spend(agent, to, amount)` (only the agent, only within cap), `withdrawBudget`, `revoke(agent)`. G$ via ERC-20 `transferFrom`/allowance; reentrancy-guarded.
- [x] E3. Foundry tests for stake/budget/spend/revoke + over-cap rejection + cooldown + only-operator/only-agent — **11/11 green**.
- [x] E4. Deploy script `script/Deploy.s.sol` (+ `deploy:alfajores`/`deploy:celo`). **Deployed to Celo mainnet** at `0x2CcDe0a686927E482Ae998550c97949965BeDC84` (bound to G$); `AGENT_VAULT_ADDRESS` / `VITE_AGENT_VAULT_ADDRESS` set + baked into `packages/chain/addresses`.
- [x] E5. Reads in `packages/chain`: `getAgentVaultStatus(agent)` (stake, budgetCap, spent, remaining, revoked, unlockAt); address configurable via `AGENT_VAULT_ADDRESS`, returns `vaultConfigured:false` until deployed.
- [x] E6. Verify path includes on-chain `stake` + `budgetRemaining`; `apps/web` `/manage` page (approve → stake → fund budget → revoke via Wagmi writes) + "Manage" links from My Agents. Live writes activate once the vault is deployed.

**Deliverables:** on-chain stake + budget wired into issue/verify/manage.

**Gate:** Operator stakes G$ and sets a budget; `verify` reflects `stake`/`budgetRemaining`; a spend within cap succeeds and over-cap reverts; revoke invalidates the credential.

---

## Phase F — ERC-8004 Tier 1 + publish

**Goal:** Interoperability with the Celo agent stack + a shippable SDK.

**Tasks**
- [x] F1. `packages/agent-id/src/erc8004.ts` — encode the GoodDollar credential into an ERC-8004 registration file (embedded under `gooddollar-proof-of-human`), `extractGoodDollarProof`, `verifyErc8004Registration`, `toDataUri`/`fromDataUri`, on-chain metadata encode/decode. **5 vitest green** (13 total in package).
- [x] F2. Read/cross-check the Celo ERC-8004 Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (confirmed via Celo docs). `packages/chain` `getErc8004Agent(agentId)` reads owner/agentURI/agentWallet + on-chain GoodDollar proof — **live-verified vs mainnet agent #1**.
- [x] F3. SDK published: decoupled to **viem-only** (dropped `@goodagent/chain`/`shared`; live lookup reimplemented via `createHumanRootLookup`), `package.json` metadata (license/keywords/files/exports/`publishConfig`), `packages/agent-id/README.md`. **Live on npm: [`@goodagent/agent-id`](https://www.npmjs.com/package/@goodagent/agent-id) v0.1.0** (`npm i @goodagent/agent-id viem`).
- [x] F4. Integration example: `examples/verify-agent.mjs` — SDK-only issue → verify (incl. **live** Celo human-root read) → ERC-8004 round-trip. Runs green.
- [x] F5. Docs: `examples/README.md` + SDK README quickstart; plan tracker updated. (npm READMEs done; `docs/` quickstart links to SDK README.)

**Deliverables:** published SDK + MCP; ERC-8004-readable credentials; an external integration example.

**Gate:** A fresh external script installs the SDK and verifies a live agent in under 10 minutes.

---

## Phase G — Identity-only refactor (drop budgets)

**Goal:** Sharpen the product to a pure **identity** layer. Remove agent spending
budgets entirely; keep only an **optional** G$ stake. Add inclusive sybil resistance.

**Tasks**
- [x] G1. SDK **0.2.0** — drop `stake` + `budgetCap` from the signed EIP-712 `AgentID` struct (identity-only); update types/sign/serialize/verify; `verifyAgentId` no longer returns money fields. Breaking change (new type hash, new major-minor).
- [x] G2. `AgentVault` rewritten **stake-only** — removed `fundBudget`/`spend`/`withdrawBudget`/`revoke`/budget state; kept `stake`/`requestUnstake`/`withdrawStake`; `getAgent → (operator, stake, unlockAt)`. Foundry tests rewritten (9/9 green).
- [x] G3. `packages/chain` — stake-only `agentVaultAbi` + `getAgentVaultStatus` (operator, stake, unlock only); vault address reset to zero pending redeploy.
- [x] G4. **Per-human cap of 10** — enforced at `/agent/issue` via `countActiveAgentsByHumanRoot` (re-issue excluded); `human_root` index added.
- [x] G5. **List by human root** — `/agent/list?humanRoot=` + `listAgentsByHumanRoot` return every agent a human vouched for (+ `activeCount`, `maxPerHuman`).
- [x] G6. **Verifier-chosen minimum** — `/agent/verify/:address?minStake=` returns a `meetsMinStake` flag; protocol imposes no global minimum.
- [x] G7. Web sweep — identity-only issue form, stake-only `/manage` (approve → stake → request unstake → withdraw), verify shows the optional bond, copy updated; My Agents shows cap usage.
- [x] G8. Prisma — dropped `stake`/`budget_cap` columns; full docs sweep.

**Deliverables:** identity-only credential + SDK 0.2.0; stake-only vault; per-human cap; vouched-agents listing.

**Gate:** Issue is free and identity-only; the 11th active agent for a human is rejected; verify returns the live optional stake; a stake-only `AgentVault` is deployed and wired.

---

## Phase H — Repo hygiene + compulsory G$ bond

**Goal:** Make the codebase tell the same story as the deck (one consistent name, no
copilot leftovers) and give **G$ a non-optional role** so on-chain G$ volume can't be zero,
while staying inclusive (the bond is a refundable deposit, not a fee).

**Tasks**
- [x] H1. **Rename** all workspace packages `@g-copilot/*` → `@goodagent/*` (shared, chain, db, api, web); update imports, deps, scripts, `vercel.json`; reinstall.
- [x] H2. **Remove the chat copilot** — deleted `apps/api/src/lib/agent.ts` + `/chat` route, `apps/web` `Chat` page/route + chat API client + CSS, shared `chat*` schemas; dropped `openai` + `@modelcontextprotocol/sdk` from the API; cleaned `.env.example`.
- [x] H3. **Rename** `GCopilotError` → `AgentIdError`; fixed copilot wording in code (`wagmi` metadata, `ErrorBoundary`, READMEs).
- [x] H4. **`AgentVault` minStake** — added immutable `minStake` (constructor arg, default 250 G$) enforced in `stake()` (resulting position ≥ min) and `withdrawStake()` (remaining is 0 or ≥ min). Foundry tests rewritten (14/14 green). Redeployed to Celo mainnet `0x0409042B55e99Df8c0Feb7525A770838f3A47090`.
- [x] H5. **API** — `/agent/issue` reads the live vault bond and rejects (`402 STAKE_REQUIRED`) unless `stake ≥ minStake`; `getAgentVaultStatus` now returns `minStake` / `minStakeFormatted` / `meetsMinStake`.
- [x] H6. **Web** — Issue page enforces Approve → Stake(≥250) → Sign & issue; Manage/Verify copy updated to "required, refundable bond".
- [x] H7. **Docs/pitch/application** swept: "optional stake" → "required refundable bond"; G$ utility reframed as guaranteed, non-zero demand.

**Deliverables:** one consistent `@goodagent/*` name; no copilot code; a compulsory, refundable G$ bond (on-chain `minStake` 250 G$) gating registration.

**Gate:** Registering an agent is impossible without an active on-chain bond ≥ `minStake`; the repo contains no `@g-copilot`/`GCopilot`/chat-copilot references.

---

## Phase I — Real ERC-8004 `IHumanProofProvider` (honesty fix)

**Goal:** Close the audit's biggest credibility gap. Before, "ERC-8004 interop"
only meant a custom JSON blob under a private metadata key + our own verifier —
no standard provider interface, so no real cross-stack interop. Replace the
overstated claim with a **deployed, standard-conformant provider** and reframe the
docs to the now-true (and stronger) story.

**Tasks**
- [x] I1. Researched the real interface: Self's `IERC8004ProofOfHuman` extension calls a provider-agnostic `IHumanProofProvider` (`verifyHumanProof(proof,data)→(verified,nullifier)`, `providerName`, `verificationStrength`).
- [x] I2. Built `packages/contracts/src/IHumanProofProvider.sol` + `GoodDollarHumanProofProvider.sol` — reads the **live** GoodDollar whitelist (`getWhitelistedRoot`), requires the human's EIP-712 consent signature, returns the identity root as a deterministic per-human nullifier; rejects malleable/high-s sigs.
- [x] I3. Foundry tests (10/10 green) incl. a `RegistryHarness` proving the full `registerWithHumanProof` → `verifyHumanProof` → per-human count flow with zero external deps.
- [x] I4. **Deployed to Celo mainnet** `0x80c4de6872049cb20989156bca50134c781f48c9` (`providerName "GoodDollar"`, `verificationStrength 75`).
- [x] I5. Wired into `packages/chain` (address + `goodDollarProofProviderAbi`) and the SDK (`humanProof.ts`: `humanProofTypedData`/`humanProofDigest`/`encodeHumanProofData` + provider constants); registration envelope now carries the provider address. SDK → **0.4.0**.
- [x] I6. SDK cross-check test asserts the TS EIP-712 digest equals the deployed contract's on-chain `proofDigest` (17/17 vitest green).
- [x] I7. Docs/pitch/overview/spec/README reframed: "registered/interoperable" → "deployed standard-conformant `IHumanProofProvider`; registry **acceptance** is the open coordination step".

**Deliverables:** a real, tested, deployed ERC-8004 Proof-of-Human provider; SDK helpers to drive it; honest, stronger docs.

**Gate:** `GoodDollarHumanProofProvider` is live on Celo, conforms to `IHumanProofProvider`, and no doc claims native cross-stack interop before registry acceptance. **Open (Tier 3):** get the provider approved in a live PoH registry (Self/8004 coordination) + land one design partner.

---

## Build order & milestones

```
A ─▶ B ─▶ C ─▶ D   ⇒  demoable product (off-chain, website + Explorer)   ← application milestone
              └▶ E ─▶ F   ⇒  on-chain G$ mechanics + ERC-8004 + npm
```

| GoodBuilders week | Target | Maps to |
|---|---|---|
| 4 | Verify → issue Agent ID; `verifyAgent` API live | A + B (+ start C) |
| 8 | Optional stake; public Explorer; 50 agents · 100 verifications | C + D + E |
| 12 | ERC-8004 Tier 1; SDK + MCP on npm; 200 agents · 1 integration | F + G |

---

## Current status tracker

| Phase | Status | Notes |
|-------|--------|-------|
| A Credential core | ✅ Gate passed | `packages/agent-id`: EIP-712 sign/verify + live human-root lookup; 8/8 vitest green (2026-06-29) |
| B API + MCP | ✅ Gate passed | `/agent/issue`, `/agent/verify/:addr`, `/agent/list`; MCP `gooddollar_verify_agent` (+injectable lookup); Prisma `AgentCredential` pushed to live Supabase; end-to-end smoke vs live Celo (2026-06-29) |
| — Frontend pivot | ✅ Done | MiniPay → website; `apps/web` + MetaMask via Reown AppKit (2026-06-29) |
| C Issue (website) | 🔄 Code-complete | Connect (MetaMask) → verify gate → EIP-712 sign → `POST /agent/issue`; builds + dev smoke pass. Pending: live valid-issue test with a real GoodDollar-verified wallet; in-app FV SDK (`generateFVLink`) — currently links to GoodDollar wallet |
| D Explorer/Verify | ✅ Done | Public `/verify` page (no wallet) + `?agent=` deep link; live dev smoke via API proxy (2026-06-29) |
| E Stake (was stake+budget) | ♻️ Superseded by G | Original AgentVault (stake + delegated budget) was deployed & tested; the budget half was removed in Phase G. See G for the current stake-only design |
| F ERC-8004 + npm | ✅ Gate passed | `agent-id/erc8004.ts` (encode/verify registration); `chain.getErc8004Agent` live-verified vs Celo registry `0x8004A169…a432`; SDK decoupled to **viem-only** + publish metadata + README; `examples/verify-agent.mjs` runs green. **Published: [`@goodagent/agent-id`](https://www.npmjs.com/package/@goodagent/agent-id) on npm** (2026-06-30) |
| G Identity-only refactor | ✅ Done | SDK 0.3.0 identity-only struct (scopes also removed); stake-only AgentVault; per-human cap of 10; list/cap by human root; verifier `minStake`; web + docs swept; SDK + MCP published to npm (2026-06-30) |
| H Hygiene + compulsory bond | ✅ Done | `@goodagent/*` rename; chat copilot removed; `GCopilotError`→`AgentIdError`; `AgentVault` `minStake` 250 G$ enforced on-chain (Foundry 14/14) + redeployed `0x0409042B…7090`; `/agent/issue` requires bond ≥ min; web Approve→Stake→Issue; docs/pitch reframed (2026-06-30) |
| I Real ERC-8004 provider | ✅ Gate passed | `GoodDollarHumanProofProvider` (standard `IHumanProofProvider`, live whitelist read + EIP-712 consent + per-human nullifier) deployed on Celo `0x80c4…48c9`; Foundry 10/10; SDK 0.4.0 helpers + on-chain digest cross-check (vitest 17/17); docs reframed. Open: Tier 3 registry acceptance + design partner (2026-06-30) |

Legend: ⬜ Not started · 🔄 In progress · ✅ Gate passed · ♻️ Superseded

---

## Next action

**Start Phase A** → scaffold `packages/agent-id` and implement the EIP-712 credential +
`verifyAgentId`, reusing `getVerifyStatus` from `packages/chain` for the human-root read.
Pass the Phase A gate (green tests) before touching the API.
