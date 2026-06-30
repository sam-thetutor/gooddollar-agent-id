# @goodagent/mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets any
MCP-compatible agent runtime (Claude Desktop, Cursor, custom frameworks)
**verify a GoodDollar Agent ID** and read basic GoodDollar state on Celo.

All tools are **read-only** — the server never holds keys, signs, or broadcasts
transactions. Agent verification re-reads the GoodDollar whitelist **live** on
Celo, so a credential auto-invalidates if the human's verification lapses.

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
| `gooddollar_verify_agent` | Confirm an AI agent is vouched for by a real, currently-verified GoodDollar human | `{ credential }` (full signed wire-form credential) |
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
{ "found": true, "valid": true, "agent": "0x...", "operator": "0x...", "humanRoot": "0x...", "expiresAt": "1735689600", "reason": null }
```

`valid` is true only if the signature recovers to `operator`, the credential is
not expired, and the operator is **still** a whitelisted GoodDollar identity.

> Looking up a stored credential by agent address (without holding the
> credential) is served by the hosted REST API:
> `GET https://gcopilot-api.geinz.lol/agent/verify/:address`.

## Verify in code instead

The same verification is available directly via the SDK
[`@goodagent/agent-id`](https://www.npmjs.com/package/@goodagent/agent-id):

```ts
import { verifyAgentId, liveHumanRootLookup } from "@goodagent/agent-id";

const { valid, operator } = await verifyAgentId(credential, {
  humanRootLookup: liveHumanRootLookup,
});
```

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `CELO_RPC_URL` | `https://forno.celo.org` | Celo JSON-RPC endpoint |
| `GOODDOLLAR_ENV` | `production` | GoodDollar contracts environment |

## License

MIT
