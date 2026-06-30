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
| **Agent ID credential** | An EIP-712 signed statement: *"This human root vouches for this agent until this time."* — a pure identity statement. |
| **Stake / bond** | A **required, refundable** G$ bond (≥ `minStake`, default 250 G$) the operator locks behind an agent as skin-in-the-game. Lives on-chain in `AgentVault`, never part of the signed struct, read live at verify time. |

**Design principle:** non-custodial, standard-first, and **identity-only credential**. The
credential proves a real human vouches for an agent — nothing more. The G$ bond is a
separate, on-chain layer: signing is free, but *registering* an agent requires an active
bond ≥ `minStake`. We never hold keys; we add a *passport-free human root* to the existing
ERC-8004 trust standard rather than forking it.

---

## 2. The credential (EIP-712)

The operator signs this in their own wallet (MetaMask). Signing is free — the credential
is an off-chain identity statement, no gas required. The required G$ bond is a separate
on-chain step (and is **not** part of the signed struct), enforced at registration time.

```
domain = {
  name: "GoodDollar Agent ID",
  version: "1",
  chainId: 42220,            // Celo mainnet
  verifyingContract: 0x0     // identity statement, not bound to a contract
}

AgentID = {
  agent:      address,   // the agent's address
  operator:   address,   // the human's wallet (must be GoodDollar-whitelisted)
  humanRoot:  address,   // getWhitelistedRoot(operator) at issuance (root wallet)
  nonce:      uint256,   // per-operator, prevents replay
  issuedAt:   uint64,
  expiresAt:  uint64     // hard expiry; should be <= operator verification expiry
}
```

> **Identity-only struct by design.** The signed struct carries no money fields. The G$
> bond lives in `AgentVault` keyed by the agent address and is read live at verify time,
> so adding/removing a bond never re-signs or invalidates the credential.

The signed credential (struct + signature) is the portable artifact. It can live
off-chain (passed in API calls, agent metadata) and/or be anchored on-chain.

---

## 3. Verification algorithm

`verifyAgent(agentAddress)` (and `verifyCredential(credential, sig)`) returns:

```
{ valid, operator, humanRoot, expiresAt, reason, onchain: { stake, minStake, meetsMinStake } }
```

The identity verdict (`valid`) never depends on money. The on-chain `stake`, the protocol
`minStake`, and `meetsMinStake` are read separately and returned alongside so verifiers can
apply their **own** (higher) minimum bond (see `?minStake=` on `/agent/verify/:address`).

Checks performed:
1. **Signature** recovers to `operator`.
2. **Operator is a real human now:** `getWhitelistedRoot(operator)` is non-zero **and**
   matches `humanRoot` (re-check live, not just at issue time).
3. **Not expired:** `now < expiresAt`.
4. **Not revoked:** the stored credential isn't revoked / superseded.

> **Key property — liveness of human-ness:** because step 2 re-reads the GoodDollar
> whitelist live, an agent's credential **auto-invalidates** if the operator's
> verification lapses (GoodDollar verification expires periodically). This is exactly
> the guarantee a verifier wants and is hard to get from a one-time passport scan.

---

## 4. ERC-8004 integration (additive, not a fork)

ERC-8004 = three registries: **Identity**, **Reputation**, **Validation**. Celo's
Identity Registry lives at `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`; Self's
Proof-of-Human provider is registered there too.

We integrate in tiers so the roadmap and the honest status are clear:

| Tier | What | Status |
|------|------|--------|
| **Tier 1 — Metadata attestation** | Embed the GoodDollar Agent ID credential in the agent's ERC-8004 registration file / on-chain registry metadata. Readable + verifiable by anyone using our open SDK. No new contracts. | **Shipped** |
| **Tier 2 — Standard `IHumanProofProvider`** | A deployed contract implementing the exact ERC-8004 Proof-of-Human provider interface (`verifyHumanProof` / `providerName` / `verificationStrength`), reading the **live GoodDollar whitelist** and returning a deterministic per-human nullifier. Any `IERC8004ProofOfHuman` registry can call it. | **Shipped — deployed on Celo** |
| **Tier 3 — Registry acceptance** | Getting the GoodDollar provider **approved** (`isApprovedProvider`) inside a live PoH registry (e.g. Self's `SelfAgentRegistry`) so Self-stack verifiers natively accept GoodDollar-rooted agents. | Roadmap — needs Self/8004 coordination |

`GoodDollarHumanProofProvider` is deployed on Celo mainnet at
`0x80c4de6872049cb20989156bca50134c781f48c9` (`providerName() = "GoodDollar"`,
`verificationStrength() = 75`).

**Answer to "does ERC-8004 force passport/Self?"** — No. The Proof-of-Human
extension is *provider-agnostic*: the interface explicitly allows "any ZK
identity system (Self, World ID, Humanity Protocol, …)" to implement
`IHumanProofProvider`. GoodDollar is now one such **deployed, standard-conformant
provider**. What is *not* yet true: a Self-rooted verifier will only accept a
GoodDollar-rooted agent once our provider is **approved in the registry it
trusts** (Tier 3). Tier 1's embedded credential is interoperable today only for
consumers that use our SDK — not automatically for every ERC-8004 reader.

---

## 5. Sybil resistance & the required G$ bond

Signing is **free** (no gas, no fee), so the cryptographic identity statement stays
accessible. Registering an agent adds skin-in-the-game via a **refundable** bond, giving G$
a guaranteed role while staying inclusive (the bond is a deposit, payable from UBI, that
returns to the operator):

| Mechanism | Behavior |
|-----------|----------|
| **Per-human cap** | A single GoodDollar human (`humanRoot`) may vouch for at most **10** active agents. Enforced at issue; revoking an agent frees a slot. Prevents one human minting unlimited agents. |
| **Required refundable bond** | To register an agent, the operator must lock ≥ `minStake` (default 250 G$) in `AgentVault`. Enforced on-chain (`minStake`) and at `/agent/issue`. Refundable and revocable by the operator after a cooldown. |
| **Verifier-chosen higher minimum** | Verifiers may require *more* bond than the protocol floor. The API/SDK return the live bond, `minStake`, and `meetsMinStake`; a verifier-supplied `?minStake=` adds a custom check. |

The bond is a refundable deposit, not a paywall — inclusive but never zero.

---

## 6. Components & where they live

| Component | Location | Role |
|-----------|----------|------|
| Identity reads | `packages/chain` | `getWhitelistedRoot`, expiry, balances (reuse) |
| Credential lib | `packages/agent-id` (new) | EIP-712 sign/verify, types, ERC-8004 encoders |
| MCP tools | `packages/mcp-server` | `issueAgentId`, `verifyAgent`, `getAgentStatus` |
| API | `apps/api` | REST `/agent/issue`, `/agent/verify/:address`, `/agent/list` |
| Web app | `apps/web` | On-ramp (connect MetaMask + verify) → stake bond → issue → "My Agents" → Manage (stake) |
| Explorer | `apps/web` (`/verify`) | Public verify-any-agent page |
| Contracts | `packages/contracts` (`AgentVault`) | Required refundable G$ bond per agent (on-chain `minStake`) — stake-only |

---

## 7. End-to-end user flow

1. **Operator opens the web app** and connects MetaMask (Reown AppKit multi-wallet).
2. **Verify human:** if not whitelisted, the operator completes GoodDollar face
   verification. On success, they have a `humanRoot`.
3. **Create agent:** operator enters the agent's address (subject to the
   per-human cap of 10 active agents).
4. **Stake the bond:** operator approves G$ and locks ≥ `minStake` (250 G$) in
   `AgentVault` for the agent — required to register, refundable later.
5. **Sign credential:** operator signs the EIP-712 `AgentID` in their wallet — free, no gas.
   `/agent/issue` only persists it once the on-chain bond meets `minStake`.
6. **Agent acts:** the agent presents its credential to a counterparty/marketplace.
7. **Verifier checks:** counterparty calls `verifyAgent(address)` (MCP/REST/SDK) →
   gets `{ valid, humanRoot, expiresAt, onchain: { stake, minStake, meetsMinStake } }`,
   applies its own (higher) minimum bond if any, and decides.
8. **Manage / revoke:** operator can add/withdraw the bond (cooldown) or revoke anytime;
   credential also auto-expires and auto-invalidates if their verification lapses.

---

## 8. Security & trust boundaries

- **Non-custodial:** operator signs in their own wallet; we never hold keys.
- **Identity-only credential:** no money fields in the signed struct; nothing to drain.
- **Live human check:** verification re-reads the GoodDollar whitelist; stale humans fail.
- **Replay protection:** per-operator nonce + expiry in the signed struct.
- **Sybil resistance:** GoodDollar's unique-human face verification **plus** a per-human
  cap of 10 active agents **plus** a required refundable bond per agent.
- **Self-custodied bond:** the required G$ bond only ever moves between the operator and
  `AgentVault`; it is fully refundable and the contract never pays third parties.
