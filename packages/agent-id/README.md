# GoodDollar Agent ID

**Passport-free Proof-of-Human for AI agents.** A tiny, `viem`-only SDK to issue
and verify EIP-712 credentials that prove an AI agent is operated by a real,
**currently-verified GoodDollar human** — and to expose that proof through the
[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) "Trustless Agents" standard.

Unlike KYC/passport-based agent identity, GoodDollar verification is **face-based,
free, and global**. A credential auto-invalidates the moment the operator's
GoodDollar verification lapses, because verification reads the human root **live**
on every check.

## The rules

1. **Human-rooted** — only a currently-verified GoodDollar human (face verification,
   no passport) can vouch for an agent, by signing an EIP-712 credential in their
   own wallet. Signing is free and non-custodial.
2. **Bond-backed** — registering an agent requires locking a **refundable G$ bond
   ≥ 250 G$** in the on-chain `AgentVault`, and the bond must **stay locked for the
   agent's whole active life**: verification re-reads the vault live and fails with
   `insufficient_bond` the moment the bond drops below the minimum. Withdrawing the
   bond (3-day cooldown, always refunded to the operator) is how an operator
   *un-vouches* an agent.
3. **Live, not snapshot** — both the human root and the bond are re-read on-chain
   on every verification. There is no cached "verified" state to go stale.
4. **Capped fan-out** — one human can vouch for at most 10 active agents.

## Install

```bash
npm install @goodagent/agent-id viem
```

## Issue a credential (operator signs)

```ts
import { privateKeyToAccount } from "viem/accounts";
import { buildAgentId, signAgentId } from "@goodagent/agent-id";

const operator = privateKeyToAccount(process.env.OPERATOR_PK as `0x${string}`);

const fields = buildAgentId({
  agent: "0xAgentAddress…",
  operator: operator.address,
  humanRoot: "0xOperatorsGoodDollarRoot…", // from getWhitelistedRoot
  ttlDays: 30,
});

const credential = await signAgentId(operator, fields); // EIP-712 signed
```

## Verify a credential (anyone)

```ts
import {
  verifyAgentId,
  liveHumanRootLookup,
  liveStakeLookup,
} from "@goodagent/agent-id";

const result = await verifyAgentId(credential, {
  humanRootLookup: liveHumanRootLookup, // reads GoodDollar Identity on Celo
  stakeLookup: liveStakeLookup,         // reads the live G$ bond in AgentVault
});

result.valid; // true only if: signature ok, not expired, operator verified NOW,
              // and the required G$ bond is still locked (>= vault minimum)
result.reason; // e.g. "insufficient_bond" if the operator withdrew the bond
result.stake;  // live bond (base units), alongside result.minStake
```

Use `createHumanRootLookup({ rpcUrl })` / `createStakeLookup({ rpcUrl, vault })`
to point at your own Celo RPC, or supply custom lookups (e.g. cached ones) for
tests. If you omit `stakeLookup`, only the identity checks run — pass it whenever
you want the full "human-backed **and** bonded" guarantee (recommended).

## ERC-8004 interop

Embed the proof in an ERC-8004 registration file (the "agent card"), then verify
it from the other side:

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
  agentId: 42, // ERC-8004 NFT id (optional)
});

// Host it, or use a fully on-chain data: URI as the agentURI:
const agentURI = toDataUri(registration);

// A third party verifies the embedded Proof-of-Human:
const v = await verifyErc8004Registration(registration, {
  humanRootLookup: liveHumanRootLookup,
});
v.valid; // human-backed? ; v.agent === the agent address
```

The proof is also encodable for the Identity Registry's on-chain
`setMetadata(agentId, "gooddollar-proof-of-human", bytes)` via
`encodeMetadataValue` / `decodeMetadataValue`.

## On-chain `IHumanProofProvider`

GoodDollar ships a deployed ERC-8004 `IHumanProofProvider` on Celo mainnet
(`0x80c4de6872049cb20989156bca50134c781f48c9`) that any `IERC8004ProofOfHuman`
registry can call. Build the `proof`/`data` arguments a registry expects:

```ts
import {
  GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO,
  humanProofTypedData,
  encodeHumanProofData,
} from "@goodagent/agent-id";

const typedData = humanProofTypedData(human, agent); // EIP-712 the human signs
const proof = await wallet.signTypedData(typedData); // the `proof` argument
const data = encodeHumanProofData(human, agent);     // the `data` argument
// registry.registerWithHumanProof(agentURI, GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO, proof, data)
```

The provider reads the **live** GoodDollar whitelist and returns a deterministic
per-human nullifier; `humanProofDigest(human, agent)` matches the contract's
on-chain `proofDigest`.

## API surface

| Export | Purpose |
|---|---|
| `buildAgentId`, `signAgentId`, `hashAgentId` | Build & sign the EIP-712 credential |
| `verifyAgentId` | Verify signature + expiry + **live** human root + **live** G$ bond |
| `liveHumanRootLookup`, `createHumanRootLookup` | GoodDollar Identity read on Celo |
| `liveStakeLookup`, `createStakeLookup` | Live `AgentVault` bond read on Celo |
| `AGENT_VAULT_CELO` | Deployed `AgentVault` address (Celo mainnet) |
| `agentIdDomain`, `agentIdTypes` | EIP-712 domain/types (for wallets) |
| `credentialToWire` / `credentialFromWire` | JSON-safe (bigint→string) serialization |
| `buildErc8004Registration`, `verifyErc8004Registration` | ERC-8004 encode / verify |
| `extractGoodDollarProof`, `toDataUri`, `fromDataUri` | ERC-8004 helpers |
| `encodeMetadataValue`, `decodeMetadataValue` | On-chain metadata bytes |
| `humanProofTypedData`, `humanProofDigest`, `encodeHumanProofData` | Build `IHumanProofProvider` proof/data |
| `GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO` | Deployed provider address (Celo) |

## How verification works

1. Recover the EIP-712 signer — must equal `operator`.
2. Reject if the credential is expired.
3. Read the operator's GoodDollar root **live** (`getWhitelistedRoot`); reject if not verified now.
4. Reject if the live root ≠ the root in the credential.
5. With a `stakeLookup`: read the agent's **live** G$ bond in `AgentVault`; reject
   with `insufficient_bond` if it is below the vault minimum (i.e. the operator
   withdrew their stake). The agent verifies again as soon as the bond is re-staked —
   no re-signing needed.

The bond is a **required, refundable** accountability stake (≥ 250 G$ on Celo
mainnet) enforced by the `AgentVault` contract — see the monorepo
`packages/contracts`. It only ever returns to the operator.

## License

MIT
