# GoodDollar Agent ID

**Passport-free Proof-of-Human for AI agents.** A tiny, `viem`-only SDK to issue
and verify EIP-712 credentials that prove an AI agent is operated by a real,
**currently-verified GoodDollar human** — and to expose that proof through the
[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) "Trustless Agents" standard.

Unlike KYC/passport-based agent identity, GoodDollar verification is **face-based,
free, and global**. A credential auto-invalidates the moment the operator's
GoodDollar verification lapses, because verification reads the human root **live**
on every check.

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
import { verifyAgentId, liveHumanRootLookup } from "@goodagent/agent-id";

const result = await verifyAgentId(credential, {
  humanRootLookup: liveHumanRootLookup, // reads GoodDollar Identity on Celo
});

result.valid; // true only if signature ok, not expired, operator verified NOW
```

Use `createHumanRootLookup({ rpcUrl })` to point at your own Celo RPC, or supply
any custom lookup (e.g. a cached one) for tests.

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
| `verifyAgentId` | Verify signature + expiry + **live** human root |
| `liveHumanRootLookup`, `createHumanRootLookup` | GoodDollar Identity read on Celo |
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

Optional on-chain accountability (a revocable G$ **stake** that vouches for the agent) is
provided by the `AgentVault` contract — see the monorepo `packages/contracts`.

## License

MIT
