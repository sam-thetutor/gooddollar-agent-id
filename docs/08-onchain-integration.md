# Onchain integration

GoodDollar + Celo integration reference for Agent ID. Everything trust-related is
read **live** from chain; the API stores no cached verdicts.

## Network

| Property | Value |
|----------|-------|
| Chain | Celo mainnet |
| Chain ID | `42220` |
| RPC | `https://forno.celo.org` (public) |
| Dev env | [goodwallet.dev](https://goodwallet.dev) + dev contracts (`GOODDOLLAR_ENV=development`) |

## Contracts (Celo mainnet)

| Contract | Address | Use |
|----------|---------|-----|
| **G$ Token** | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` | Balance, stake approvals |
| **GoodDollar Identity** | See [core contracts](https://docs.gooddollar.org/for-developers/core-contracts) | Face-verification whitelist / human root |
| **AgentVault** | `0x0409042B55e99Df8c0Feb7525A770838f3A47090` | Required refundable G$ bond per agent (on-chain `minStake` 250 G$) — stake-only |
| **ERC-8004 Identity Registry** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Agent registration (interop) |
| **ERC-8004 Reputation Registry** | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | Agent reputation (interop) |

Addresses live in `packages/chain/src/addresses.ts`. The AgentVault address can be
overridden with `AGENT_VAULT_ADDRESS`; it falls back to the known mainnet
deployment.

## GoodDollar identity (the human root)

The credential's trust comes from the operator's GoodDollar verification, read
live on every check.

```ts
import { IdentitySDK } from "@goodsdks/citizen-sdk/viem-identity-sdk";

const identitySDK = new IdentitySDK(publicClient, walletClient, "production");
const { isWhitelisted, root } = await identitySDK.getWhitelistedRoot(address);
```

In the SDK, this is wrapped as a pluggable lookup so verification has no server
dependency:

```ts
import { verifyAgentId, liveHumanRootLookup, createHumanRootLookup } from "@goodagent/agent-id";

// default mainnet lookup …
await verifyAgentId(credential, { humanRootLookup: liveHumanRootLookup });
// … or point at your own RPC:
const lookup = createHumanRootLookup({ rpcUrl: "https://forno.celo.org" });
```

Onboarding (face verification) uses `identitySDK.generateFVLink(...)`; the web app
currently links operators to the GoodDollar wallet to verify.

Docs: [Sybil Resistance](https://docs.gooddollar.org/for-developers/apis-and-sdks/sybil-resistance)

## AgentVault — required refundable G$ bond (stake-only)

`AgentVault` (Foundry source in `packages/contracts`) requires an operator to back an
agent with a **refundable G$ bond** (≥ `minStake`, default **250 G$**) as skin-in-the-game
before it can be registered. It is stake-only — there are no spending budgets or
third-party transfers; G$ only ever moves between the operator and the vault, and the bond
is fully refundable. `minStake` is enforced on-chain in `stake()`/`withdrawStake()`. Flow
from the web app (Issue page) / `/manage`:

1. `approve(AgentVault, amount)` on the G$ token (the app approves `maxUint256`).
2. `stake(agent, amount)` — bond ≥ `minStake` G$ behind the agent (required to register).
3. `requestUnstake(agent)` — start the 3-day cooldown.
4. `withdrawStake(agent, amount)` — pull the bond back after the cooldown (must leave 0 or ≥ `minStake`).

Read the bond with `getAgentVaultStatus(agent)` (`packages/chain`) — returns `stake`,
`minStake`, `meetsMinStake` — surfaced on the public verify page. Verifiers may also apply
their own (higher) minimum.

## ERC-8004 Proof-of-Human provider

GoodDollar plugs into the ERC-8004 Proof-of-Human extension in two ways:

**1. A deployed `IHumanProofProvider`** (`packages/contracts/GoodDollarHumanProofProvider.sol`,
Celo mainnet `0x80c4de6872049cb20989156bca50134c781f48c9`). It implements the exact
provider interface (`verifyHumanProof(proof, data)` → `(verified, nullifier)`,
`providerName()`, `verificationStrength()`) that an `IERC8004ProofOfHuman`
registry calls during `registerWithHumanProof`. It reads the **live GoodDollar
whitelist** (`getWhitelistedRoot`), requires the human's EIP-712 consent
signature, and returns the human's identity root as a deterministic nullifier.
Build the matching `proof`/`data` with the SDK:

```ts
import {
  GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO,
  humanProofTypedData,
  encodeHumanProofData,
} from "@goodagent/agent-id";

// Human signs consent (their wallet), then a registry call can verify it on-chain:
const typedData = humanProofTypedData(human, agent);    // EIP-712 to sign
const data = encodeHumanProofData(human, agent);        // the `data` arg
// proof = await wallet.signTypedData(typedData)        // the `proof` arg
```

> Acceptance into a third-party registry (e.g. Self's `SelfAgentRegistry`, which
> gates providers via `isApprovedProvider`) is a coordination step, not code.

**2. Metadata attestation.** The signed credential also embeds in a standard
ERC-8004 registration ("agent card") under the `gooddollar-proof-of-human`
metadata key (which now also carries the provider address), verifiable via our SDK.

```ts
import {
  buildErc8004Registration,
  verifyErc8004Registration,
  toDataUri,
  credentialToWire,
} from "@goodagent/agent-id";

const registration = buildErc8004Registration({
  credential: credentialToWire(credential),
  name: "My Agent",
  agentId: 42,
});
const agentURI = toDataUri(registration); // fully on-chain data: URI

const v = await verifyErc8004Registration(registration, {
  humanRootLookup: liveHumanRootLookup,
});
```

`packages/chain` `getErc8004Agent(agentId)` reads owner / agentURI / agentWallet
and the embedded GoodDollar proof from the registry.

## Read helpers (`packages/chain`)

| Function | Purpose | Keys |
|----------|---------|------|
| `getVerifyStatus(addr)` | GoodDollar whitelist + root + expiry | none |
| `getGBalance(addr)` | G$ balance (raw + formatted) | none |
| `getClaimEligibility(addr)` | Daily UBI entitlement | none |
| `getDailyStats()` | UBI cycle stats | none |
| `getAgentVaultStatus(agent)` | Required G$ bond + `minStake`/`meetsMinStake` for an agent | none |
| `getErc8004Agent(agentId)` | ERC-8004 registration + proof | none |
| `pingChain()` | RPC connectivity | none |

All are read-only via a viem `publicClient`. Writes (approve / stake / requestUnstake /
withdrawStake) happen in the operator's wallet from the web app — the server never signs.

## References

- [GoodDollar core contracts](https://docs.gooddollar.org/for-developers/core-contracts)
- [APIs & SDKs index](https://docs.gooddollar.org/for-developers/apis-and-sdks)
- [ERC-8004 Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)
