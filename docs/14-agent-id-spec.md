# GoodDollar Agent ID — technical spec

This is the technical core of the project: how a GoodDollar-verified human issues a
**Proof-of-Human credential** for an AI agent, how anyone verifies it, and how it
plugs into **ERC-8004** without reinventing the agent stack.

---

## 1. Concepts

| Term | Meaning |
|------|---------|
| **Operator** | A GoodDollar face-verified human. Their wallet is on the GoodDollar whitelist. |
| **Agent** | An AI agent identified by its own EVM address (or a delegated session key). |
| **Human root** | The operator's GoodDollar identity root (`getWhitelistedRoot`) — proves a unique, real human. |
| **Agent ID credential** | An EIP-712 signed statement: *"This human root vouches for this agent, with these scopes/stake/budget, until this time."* |
| **Stake / bond** | G$ the operator locks against the agent's good behavior (slashable / revocable). |
| **Budget** | A capped, revocable G$ allowance the agent may spend on the operator's behalf. |

**Design principle:** non-custodial and standard-first. We never hold keys; we add a
*passport-free human root* to the existing ERC-8004 trust standard rather than forking it.

---

## 2. The credential (EIP-712)

The operator signs this in their own wallet (MiniPay). No gas required to *issue* the
off-chain credential; on-chain anchoring (stake/budget) is a separate, optional step.

```
domain = {
  name: "GoodDollar Agent ID",
  version: "1",
  chainId: 42220,            // Celo mainnet
  verifyingContract: <AgentIDRegistry>   // optional anchor; off-chain works without it
}

AgentID = {
  agent:      address,   // the agent's address
  operator:   address,   // the human's wallet (must be GoodDollar-whitelisted)
  humanRoot:  address,   // getWhitelistedRoot(operator) at issuance (root wallet)
  scopes:     string,    // e.g. "pay,trade,post" — what the agent may do
  stake:      uint256,   // G$ bonded (0 if off-chain only)
  budgetCap:  uint256,   // max G$ the agent may spend (delegated)
  nonce:      uint256,   // per-operator, prevents replay
  issuedAt:   uint64,
  expiresAt:  uint64     // hard expiry; should be <= operator verification expiry
}
```

The signed credential (struct + signature) is the portable artifact. It can live
off-chain (passed in API calls, agent metadata) and/or be anchored on-chain.

---

## 3. Verification algorithm

`verifyAgent(agentAddress)` (and `verifyCredential(credential, sig)`) returns:

```
{ valid, operator, humanRoot, scopes, stake, budgetRemaining, expiresAt, reason }
```

Checks performed:
1. **Signature** recovers to `operator`.
2. **Operator is a real human now:** `getWhitelistedRoot(operator)` is non-zero **and**
   matches `humanRoot` (re-check live, not just at issue time).
3. **Not expired:** `now < expiresAt`.
4. **Not revoked:** nonce not revoked on-chain / not superseded.
5. **(If staked)** stake still locked; budget not exhausted.

> **Key property — liveness of human-ness:** because step 2 re-reads the GoodDollar
> whitelist live, an agent's credential **auto-invalidates** if the operator's
> verification lapses (GoodDollar verification expires periodically). This is exactly
> the guarantee a verifier wants and is hard to get from a one-time passport scan.

---

## 4. ERC-8004 integration (additive, not a fork)

ERC-8004 = three registries: **Identity**, **Reputation**, **Validation**. Celo's
Identity Registry lives at `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`; Self's
Proof-of-Human provider is registered there too.

We integrate in tiers so v1 ships fast and the roadmap is clear:

| Tier | What | Status |
|------|------|--------|
| **Tier 1 — Metadata attestation** | Embed the GoodDollar Agent ID credential in the agent's ERC-8004 record / agent metadata; verifiers read it via our SDK. No new contracts. | **v1** |
| **Tier 2 — Provider attestation** | An on-chain attestation contract that records "this agent has a valid GoodDollar human root," so ERC-8004 consumers can check a single source. | Roadmap |
| **Tier 3 — Registered PoH provider** | GoodDollar registered as a first-class Proof-of-Human provider alongside Self, so the Agent Visa flow accepts face-verified humans. | Stretch / GoodDollar coordination |

**Answer to "does ERC-8004 force passport/Self?"** — No. ERC-8004 is provider-agnostic;
Self is *one* PoH provider. GoodDollar Agent ID is an **alternative provider** that the
same standard can consume. Tier 1 already makes our credential readable by any
ERC-8004 consumer; Tiers 2–3 deepen the on-chain coupling.

---

## 5. G$ mechanics (novel utility, not basic claim/send)

| Mechanism | Behavior |
|-----------|----------|
| **Stake / bond** | Operator locks G$ when issuing an agent. Visible to verifiers as skin-in-the-game. Revocable by operator (cooldown); slashable by policy in Tier 2. |
| **Delegated budget** | Operator grants the agent a **capped** G$ allowance (ERC-20 allowance to a budget module, or session-key spend limit). Agent can pay/tip/settle up to the cap. |
| **Pay-per-verify (optional)** | Tiny G$ fee for high-volume `verifyAgent` calls, routed back to operators / GoodDollar — sustainable infra economics. |

This creates **new G$ demand tied to agent trust and spending**, which is the kind of
utility GoodBuilders wants (not a wrapper around claim/transfer).

---

## 6. Components & where they live

| Component | Location | Role |
|-----------|----------|------|
| Identity reads | `packages/chain` | `getWhitelistedRoot`, expiry, balances (reuse) |
| Credential lib | `packages/agent-id` (new) | EIP-712 sign/verify, types, ERC-8004 encoders |
| MCP tools | `packages/mcp-server` | `issueAgentId`, `verifyAgent`, `getAgentStatus` |
| API | `apps/api` | REST `/agent/issue`, `/agent/verify/:address`, copilot `/chat` |
| MiniPay app | `apps/mini-app` | On-ramp (verify) → issue → "My Agents" (stake/budget) |
| Explorer | `apps/mini-app` (`/verify`) | Public verify-any-agent page |
| Contracts | `packages/contracts` (new, Tier 2) | Anchor/stake/budget/attestation |

---

## 7. End-to-end user flow

1. **Operator opens MiniPay app.** Wallet auto-connects (injected provider).
2. **Verify human:** if not whitelisted, copilot launches GoodDollar face verification
   (`generateFVLink`). On success, operator has a `humanRoot`.
3. **Create agent:** operator enters/connects the agent's address, picks scopes, sets
   stake + budget cap.
4. **Sign credential:** operator signs the EIP-712 `AgentID` in MiniPay. (Optional)
   anchor on-chain: lock stake + set budget allowance.
5. **Agent acts:** the agent presents its credential to a counterparty/marketplace.
6. **Verifier checks:** counterparty calls `verifyAgent(address)` (MCP/REST/SDK) →
   gets `{ valid, humanRoot, scopes, stake, budgetRemaining, expiresAt }` and decides.
7. **Manage / revoke:** operator can top up budget, increase stake, or revoke anytime;
   credential also auto-expires and auto-invalidates if their verification lapses.

---

## 8. Security & trust boundaries

- **Non-custodial:** operator signs in their own wallet; we never hold keys.
- **Capped delegation:** agents only ever spend within an explicit, revocable budget.
- **Live human check:** verification re-reads the GoodDollar whitelist; stale humans fail.
- **Replay protection:** per-operator nonce + expiry in the signed struct.
- **Sybil resistance:** inherited from GoodDollar's unique-human face verification.
