# Onchain integration

GoodDollar and Celo integration reference for G$ Copilot.

## Network

| Property | Value |
|----------|-------|
| Chain | Celo mainnet |
| Chain ID | `42220` |
| RPC | `https://forno.celo.org` (public) |
| Dev env | [goodwallet.dev](https://goodwallet.dev) + dev contracts |

## Core contracts (Celo mainnet)

| Contract | Address | Use |
|----------|---------|-----|
| **G$ Token** | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` | Balance, transfer |
| **UBI Scheme** | See [core contracts](https://docs.gooddollar.org/for-developers/core-contracts) | Daily claim |
| **Identity** | See core contracts | Face verification whitelist |
| **CFA Forwarder** | `0xcfA132E353cB4E398080B9700609bb008eceB125` | Superfluid streams |

Always verify addresses against official [GoodDollar docs](https://docs.gooddollar.org/for-developers/core-contracts) before production deploy.

## SDK packages

| Package | Purpose |
|---------|---------|
| `@goodsdks/citizen-sdk` | Identity + Claim (Viem/Wagmi) — **preferred** |
| `@gooddollar/web3sdk-v2` | Legacy Ethers v5 / React |

### Identity SDK (read + FV link)

```typescript
import { IdentitySDK } from '@goodsdks/citizen-sdk/viem-identity-sdk';

const identitySDK = new IdentitySDK(publicClient, walletClient, 'production');

const { isWhitelisted, root } = await identitySDK.getWhitelistedRoot(address);
const fvLink = await identitySDK.generateFVLink(false, callbackUrl, 42220);
```

Docs: [Sybil Resistance](https://docs.gooddollar.org/for-developers/apis-and-sdks/sybil-resistance)

### Claim SDK

```typescript
import { ClaimSDK } from '@goodsdks/citizen-sdk/viem-claim-sdk';

const claimSDK = await ClaimSDK.init({
  publicClient,
  walletClient,
  identitySDK,
  env: 'production',
});

const amount = await claimSDK.checkEntitlement();
if (amount > 0n) await claimSDK.claim();
```

Docs: [Claim UBI (Viem/Wagmi)](https://docs.gooddollar.org/for-developers/apis-and-sdks/ubi/claim-ubi-viem-wagmi)

## G$ transfers

G$ supports ERC-20, ERC-677 (`transferAndCall`), and ERC-777 on Celo.

**Simple transfer (v1):**

```typescript
import { parseUnits } from 'viem';

await walletClient.writeContract({
  address: G_DOLLAR_ADDRESS,
  abi: erc20Abi,
  functionName: 'transfer',
  args: [to, parseUnits(amount, 18)],
});
```

Docs: [Integrate G$ token](https://docs.gooddollar.org/for-developers/developer-guides/how-to-integrate-the-gusd-token)

## Superfluid streaming

G$ is a **pure SuperToken** on Celo — no wrapping required.

### Flow rate math

```
flowRate = amountPerMonth * 1e18 / 2_592_000
```

### Buffer

Before `createFlow`, ensure sender holds buffer + initial stream:

```typescript
// Use Superfluid CFA forwarder getBufferAmountByFlowrate
```

### Protocol fees

G$ applies `_processFees` on streamed drips; receiver gets `flowRate - feeRate`.

Docs: [Use G$ streaming](https://docs.gooddollar.org/for-developers/developer-guides/use-gusd-streaming)

## Read vs write split

| Operation | Where executed | Keys required |
|-----------|----------------|---------------|
| `balanceOf`, `getWhitelistedRoot` | MCP server (publicClient) | None |
| `checkEntitlement` | MCP server (publicClient) | None |
| `generateFVLink` | API or Mini App | User wallet for signing identifier |
| `claim`, `transfer`, `createFlow` | Mini App only | User wallet |

## Transaction builders (`packages/chain`)

```
packages/chain/src/transactions/
├── claim.ts       # encode claim tx
├── transfer.ts    # encode ERC20 transfer
└── stream.ts      # encode CFA createFlow
```

Each returns `{ to, data, value, chainId }` for wagmi `sendTransaction`.

## Indexing & metrics

Track for GoodBuilders / Flow State:

| Metric | Source |
|--------|--------|
| Claim volume | `claim` events / tx receipts |
| Transfer volume | G$ Transfer events where `from` = linked wallets |
| Stream count | Superfluid FlowUpdated events |
| Active users | Unique wallets per week |

Optional: CeloScan API or subgraph for dashboard.

## Testing

1. Create dev wallet at [goodwallet.dev](https://goodwallet.dev)
2. Use `GOODDOLLAR_ENV=development` and dev G$ contract
3. Test on Alfajores if needed before mainnet
4. Integration tests with viem `anvil` fork of Celo (advanced)

## Phase 2 integrations

| Partner | Integration |
|---------|-------------|
| Esusu | Bill pay tool adapter (API) |
| Balaio | Task listing tool |
| Gardens | Pool donation stream |
| Flow State | Voting embed after sign |

## References

- [APIs & SDKs index](https://docs.gooddollar.org/for-developers/apis-and-sdks)
- [Core contracts](https://docs.gooddollar.org/for-developers/core-contracts)
- [Superfluid docs](https://docs.superfluid.finance)
