# @goodagent/mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets any
MCP-compatible agent runtime (Claude Desktop, Cursor, custom frameworks)
**verify a GoodDollar Agent ID** and read basic GoodDollar state on Celo.

All tools are **read-only** — the server never holds keys, signs, or broadcasts
transactions. Agent verification re-reads **both** the GoodDollar whitelist and
the agent's required G$ bond (`AgentVault`) **live** on Celo, so a credential
auto-invalidates if the human's verification lapses **or** the operator withdraws
the bond (`insufficient_bond`).

## Use it (no install)

Point your MCP client at the published binary via `npx`:

```json
{
  "mcpServers": {
    "gooddollar": {
      "command": "npx",
      "args": ["-y", "@goodagent/mcp-server"],
      "env": {
        "CELO_RPC_URL": "https://forno.celo.org",
        "GOODDOLLAR_ENV": "production"
      }
    }
  }
}
```

Transport is **stdio** — the client spawns the server as a subprocess.

## Tools

| Tool | Purpose | Input |
|------|---------|-------|
| `gooddollar_verify_agent` | Confirm an AI agent is vouched for by a real, currently-verified GoodDollar human **and** still carries its required refundable G$ bond on-chain | `{ credential }` (full signed wire-form credential) |
| `gooddollar_verify_status` | Is a wallet a verified (whitelisted) GoodDollar identity? Returns root + expiry | `{ wallet }` |
| `gooddollar_get_balance` | G$ token balance (raw + formatted) | `{ wallet }` |
| `gooddollar_claim_eligibility` | Can a wallet claim its daily UBI now, and how much? | `{ wallet }` |
| `gooddollar_get_daily_stats` | GoodDollar UBI cycle stats for the current day | `{}` |
| `gooddollar_ping` | MCP + Celo RPC connectivity check | `{}` |

### `gooddollar_verify_agent`

The standalone server is stateless, so pass the full credential to verify:

```json
{
  "credential": {
    "fields": { "agent": "0x...", "operator": "0x...", "humanRoot": "0x...", "nonce": "0", "issuedAt": "...", "expiresAt": "..." },
    "signature": "0x...",
    "chainId": 42220,
    "verifyingContract": "0x..."
  }
}
```

Returns:

```json
{ "found": true, "valid": true, "operator": "0x...", "humanRoot": "0x...", "expiresAt": "1735689600", "stake": "250000000000000000000", "minStake": "250000000000000000000" }
```

`valid` is true only if the signature recovers to `operator`, the credential is
not expired, the operator is **still** a whitelisted GoodDollar identity, **and**
the agent's live G$ bond in the `AgentVault` still meets the vault minimum
(250 G$ on Celo mainnet). If the operator withdrew the bond, the result is
`{ "valid": false, "reason": "insufficient_bond", ... }` until it is re-staked.

> Looking up a stored credential by agent address (without holding the
> credential) is served by the hosted REST API:
> `GET https://goodagentids.xyz/api/agent/verify/:address`.

## Verify in code instead

The same verification is available directly via the SDK
[`@goodagent/agent-id`](https://www.npmjs.com/package/@goodagent/agent-id):

```ts
import {
  verifyAgentId,
  liveHumanRootLookup,
  liveStakeLookup,
} from "@goodagent/agent-id";

const { valid, operator } = await verifyAgentId(credential, {
  humanRootLookup: liveHumanRootLookup,
  stakeLookup: liveStakeLookup, // enforce the live G$ bond too
});
```

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `CELO_RPC_URL` | `https://forno.celo.org` | Celo JSON-RPC endpoint |
| `GOODDOLLAR_ENV` | `production` | GoodDollar contracts environment |

## License

MIT
