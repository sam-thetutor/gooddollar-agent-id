# MCP server (`gooddollar-mcp`)

The MCP server exposes GoodDollar operations as **typed tools** consumable by:

- G$ Copilot Telegram bot (LangChain tool bindings)
- Claude Desktop / Cursor via MCP config
- Any MCP-compatible agent runtime

## Transport modes

| Mode | Use case |
|------|----------|
| **stdio** | Local dev, Claude Desktop config |
| **HTTP/SSE** | Remote agents, bot sidecar (phase 2) |

## Tool categories

| Category | Signing required | Description |
|----------|------------------|-------------|
| **Read** | No | Balance, verify status, eligibility |
| **Prepare** | User signs in Mini App | Returns `actionId` + tx payload |
| **Identity** | Browser FV flow | Returns verification URL |

## Tool reference

### `gooddollar_verify_status`

Check if a wallet is face-verified on GoodDollar.

**Input**

```json
{
  "wallet": "0x..."
}
```

**Output**

```json
{
  "wallet": "0x...",
  "isWhitelisted": true,
  "root": "0x...",
  "expiresAt": "2026-12-01T00:00:00Z"
}
```

**Implementation:** `IdentitySDK.getWhitelistedRoot`, `getIdentityExpiryData`

---

### `gooddollar_claim_eligibility`

Check if wallet can claim UBI today.

**Input**

```json
{
  "wallet": "0x..."
}
```

**Output**

```json
{
  "eligible": true,
  "claimAmount": "1250000000000000000",
  "claimAmountFormatted": "1.25",
  "nextClaimTime": null
}
```

**Implementation:** `ClaimSDK.checkEntitlement`, `nextClaimTime`

---

### `gooddollar_get_balance`

G$ token balance for wallet.

**Input**

```json
{
  "wallet": "0x..."
}
```

**Output**

```json
{
  "balance": "42000000000000000000",
  "balanceFormatted": "42.0",
  "symbol": "G$"
}
```

---

### `gooddollar_get_daily_stats`

Protocol-level daily claim stats.

**Input:** `{}`

**Output**

```json
{
  "claimers": "12345",
  "amount": "..."
}
```

**Implementation:** `ClaimSDK.getDailyStats`

---

### `gooddollar_generate_verify_link`

Create face verification URL for wallet onboarding.

**Input**

```json
{
  "wallet": "0x...",
  "callbackToken": "session_abc123",
  "chainId": 42220
}
```

**Output**

```json
{
  "verifyUrl": "https://...",
  "expiresInSeconds": 3600
}
```

**Note:** `callbackToken` maps to API session; FV callback hits `/identity/callback`.

---

### `gooddollar_prepare_claim`

Prepare daily UBI claim (requires user signature).

**Input**

```json
{
  "wallet": "0x...",
  "telegramId": "123456789"
}
```

**Output**

```json
{
  "actionId": "act_...",
  "actionType": "claim",
  "signUrl": "https://mini-app/sign/act_...",
  "estimatedClaimAmount": "1.25",
  "expiresAt": "..."
}
```

**Side effect:** Stores pending action in DB.

---

### `gooddollar_prepare_transfer`

Prepare G$ transfer (requires user signature).

**Input**

```json
{
  "from": "0x...",
  "to": "0x...",
  "amount": "10.0",
  "telegramId": "123456789"
}
```

**Validation**

- `amount > 0`
- `amount <= MAX_TRANSFER` (config, e.g. 1000 G$)
- `to` is valid checksum address
- `from` matches linked session wallet

**Output**

```json
{
  "actionId": "act_...",
  "actionType": "transfer",
  "signUrl": "https://...",
  "to": "0x...",
  "amountFormatted": "10.0"
}
```

---

### `gooddollar_prepare_stream`

Prepare Superfluid G$ stream (requires user signature).

**Input**

```json
{
  "from": "0x...",
  "to": "0x...",
  "flowRatePerMonth": "5.0",
  "telegramId": "123456789"
}
```

**Output**

```json
{
  "actionId": "act_...",
  "actionType": "create_stream",
  "signUrl": "https://...",
  "flowRatePerMonth": "5.0",
  "bufferRequired": "..."
}
```

**Implementation:** CFA forwarder + buffer calculation per [GoodDollar streaming docs](https://docs.gooddollar.org/for-developers/developer-guides/use-gusd-streaming).

---

### `gooddollar_get_action_status`

Poll pending/completed action.

**Input**

```json
{
  "actionId": "act_..."
}
```

**Output**

```json
{
  "status": "pending | completed | expired | failed",
  "txHash": "0x...",
  "completedAt": "..."
}
```

## LangChain binding example

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { mcpClient } from './mcp-client';

export const verifyStatusTool = new DynamicStructuredTool({
  name: 'gooddollar_verify_status',
  description: 'Check GoodDollar face verification status for a wallet',
  schema: z.object({ wallet: z.string() }),
  func: async ({ wallet }) => {
    return mcpClient.callTool('gooddollar_verify_status', { wallet });
  },
});
```

## MCP server config (Claude Desktop)

```json
{
  "mcpServers": {
    "gooddollar": {
      "command": "node",
      "args": ["./packages/mcp-server/dist/index.js"],
      "env": {
        "CELO_RPC_URL": "https://forno.celo.org",
        "GOODDOLLAR_ENV": "production"
      }
    }
  }
}
```

## Error handling

| Code | Meaning | Agent behavior |
|------|---------|----------------|
| `NOT_VERIFIED` | Wallet not whitelisted | Suggest `/verify` flow |
| `NOT_ELIGIBLE` | Already claimed today | Show `nextClaimTime` |
| `INSUFFICIENT_BALANCE` | Transfer exceeds balance | Ask lower amount |
| `SESSION_MISMATCH` | Wallet ≠ linked telegram session | Ask reconnect |
| `ACTION_EXPIRED` | Pending action TTL passed | Regenerate prepare_* |

## Safety guardrails

- Never return private keys or mnemonics
- `prepare_*` tools do not broadcast transactions
- Rate limit per `telegramId` / IP on prepare endpoints
- Max transfer/stream limits enforced server-side
- All outputs include human-readable + raw wei amounts
