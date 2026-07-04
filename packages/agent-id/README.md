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

1. **Agent-consented** — an address can only be registered after its key attests
   (on-chain `AgentAttestation`, or a fresh agent-signed proof at issue). The
   agent consents first; squatted registrations are rejected at the door.
2. **Human-rooted** — only a currently-verified GoodDollar human (face verification,
   no passport) can vouch for an agent, by signing an EIP-712 credential in their
   own wallet. Signing is free and non-custodial.
3. **Bond-backed** — registering an agent requires locking a **refundable G$ bond
   ≥ 250 G$** in the on-chain `AgentVault`, and the bond must **stay locked for the
   agent's whole active life**: verification re-reads the vault live and fails with
   `insufficient_bond` the moment the bond drops below the minimum. Withdrawing the
   bond (3-day cooldown, always refunded to the operator) is how an operator
   *un-vouches* an agent.
4. **Revocable on-chain** — the operator can flip a kill switch in the
   `AgentRevocation` registry on Celo; verification reads it live and fails with
   `revoked`. No API dependency — every verifier sees it.
5. **Live, not snapshot** — the human root, the bond, and the revocation flag are
   re-read on-chain on every verification. There is no cached "verified" state to
   go stale.
6. **Capped fan-out** — one human can vouch for at most 10 active agents.
7. **Credentials are NOT bearer tokens** — a credential proves a human vouches
   for an agent *address*. It does not prove the party presenting it controls
   that address (credentials are public). To authenticate a counterparty, also
   require a fresh, agent-signed `AgentAuth` challenge (see below).

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

Use `verifyAgentIdLive` — **all live checks are on by default**: human root,
on-chain revocation, and the G$ bond.

```ts
import { verifyAgentIdLive } from "@goodagent/agent-id";

const result = await verifyAgentIdLive(credential);

result.valid;  // true only if: signature ok, not expired, operator verified NOW,
               // not revoked on-chain, and the G$ bond >= vault minimum
result.reason; // e.g. "insufficient_bond" (bond withdrawn) or "revoked"
result.stake;  // live bond (base units), alongside result.minStake
result.bondChecked;       // always present — was the bond actually read?
result.revocationChecked; // always present — was the revocation registry read?
result.agentProven;       // did the agent attest on-chain it controls its key?
```

The lower-level `verifyAgentId` takes explicit lookups (`humanRootLookup`,
`stakeLookup`, `revocationLookup`) — useful for tests or custom RPCs via
`createHumanRootLookup` / `createStakeLookup` / `createRevocationLookup`
(`{ rpcUrl }`). If you omit a lookup, that check is **skipped** and the result
says so via `bondChecked: false` / `revocationChecked: false` — never rely on a
`valid: true` whose flags you haven't looked at.

## Authenticate a counterparty (proof-of-possession)

A valid credential proves a human vouches for the agent *address* — anyone can
fetch and present it. To prove the party you're talking to actually **controls**
that address, require a fresh challenge signed by the agent's own key:

```ts
// Agent side — sign a fresh AgentAuth scoped to the verifier:
import { buildAgentAuth, signAgentAuth } from "@goodagent/agent-id";
import { privateKeyToAccount } from "viem/accounts";

const agentAccount = privateKeyToAccount(process.env.AGENT_PK as `0x${string}`);
const auth = buildAgentAuth({ agent: agentAccount.address, audience: "my-service" });
const authWire = await signAgentAuth(agentAccount, auth); // send with the request

// Verifier side — check possession AND the credential:
import { verifyAgentAuth, verifyAgentIdLive } from "@goodagent/agent-id";

const pop = await verifyAgentAuth(authWire, {
  expectedAgent: credential.fields.agent,
  expectedAudience: "my-service", // rejects auths replayed from other services
  // freshness: 5 min max age by default
});
const id = await verifyAgentIdLive(credential);
const trusted = pop.valid && id.valid; // human-backed AND actually them
```

The hosted registry exposes the same check as `POST /agent/verify-auth`.

## Attest key ownership on-chain (required before registration)

Registration is a two-sided handshake: the agent proves it controls its address
*first*, then the operator can vouch. The hosted registry rejects unattested
addresses (`AGENT_NOT_ATTESTED`). The on-chain `AgentAttestation` registry
records the proof permanently and trustlessly; verifiers see it as
`agentProven` / `agentProvenAt`:

```ts
import {
  attestAsAgent,
  isAgentAttested,
  relayAgentAttestation,
  signAgentAttestation,
} from "@goodagent/agent-id";

// Already attested? (registration requires true)
await isAgentAttested(agentAccount.address); // boolean

// A. Agent holds gas (CELO): one tx from its own wallet — msg.sender IS the proof.
await attestAsAgent(agentWalletClient); // viem WalletClient for the agent

// B. Gasless: the agent signs offline, anyone relays and pays the gas.
//    Single-use (bound to the on-chain nonce) and deadline-bound.
const signed = await signAgentAttestation(agentAccount); // agent's LocalAccount
await relayAgentAttestation(relayerWalletClient, signed); // any funded wallet
```

The registry stores only the *fact* (`provenAt` timestamp), never the signature
— so it can't be mistaken for a reusable authentication token. It is a
historical statement; live counterparty authentication still needs `AgentAuth`.

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
| `verifyAgentIdLive` | **Recommended** — verify with all live checks on (root, revocation, bond) |
| `verifyAgentId` | Lower-level verify with explicit lookups |
| `buildAgentAuth`, `signAgentAuth`, `verifyAgentAuth` | Agent proof-of-possession (anti-impersonation) |
| `liveHumanRootLookup`, `createHumanRootLookup` | GoodDollar Identity read on Celo |
| `liveStakeLookup`, `createStakeLookup` | Live `AgentVault` bond read on Celo |
| `liveRevocationLookup`, `createRevocationLookup` | Live `AgentRevocation` read on Celo |
| `isAgentAttested`, `attestAsAgent`, `signAgentAttestation`, `relayAgentAttestation` | Attest key ownership on-chain (required pre-registration) |
| `revokeAgentOnChain`, `reinstateAgentOnChain` | Operator kill switch on the `AgentRevocation` registry |
| `liveAttestationLookup`, `attestationTypedData`, `getAttestationNonce` | Lower-level attestation reads / typed data |
| `agentAttestationAbi`, `agentRevocationAbi`, `agentVaultAbi` | Full contract ABIs for direct viem use |
| `AGENT_VAULT_CELO`, `AGENT_REVOCATION_CELO`, `AGENT_ATTESTATION_CELO` | Deployed contract addresses (Celo mainnet) |
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
5. Read the on-chain `AgentRevocation` registry; reject with `revoked` if the
   operator flipped the kill switch. (`verifyAgentIdLive` does this by default.)
6. Read the agent's **live** G$ bond in `AgentVault`; reject with
   `insufficient_bond` if it is below the vault minimum (i.e. the operator
   withdrew their stake). The agent verifies again as soon as the bond is
   re-staked — no re-signing needed. (`verifyAgentIdLive` does this by default.)

The bond is a **required, refundable** accountability stake (≥ 250 G$ on Celo
mainnet) enforced by the `AgentVault` contract — see the monorepo
`packages/contracts`. It only ever returns to the operator.

Deployed contracts on Celo mainnet:

| Contract | Address |
|---|---|
| `AgentVault` (bond) | `0x0409042B55e99Df8c0Feb7525A770838f3A47090` |
| `AgentRevocation` (kill switch) | `0xA86a133626989115a6499b6cA67c3c8dA1662137` |
| `AgentAttestation` (key proof-of-possession) | `0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2` |

## License

MIT
