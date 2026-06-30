# MCP server (`gooddollar-mcp`)

A Model Context Protocol server that lets any MCP-compatible agent runtime
(Claude Desktop, Cursor, custom frameworks) **verify a GoodDollar Agent ID** and
read basic GoodDollar state on Celo. All tools are read-only — the server never
signs or broadcasts transactions.

Source: `packages/mcp-server`. Built on `@modelcontextprotocol/sdk`.

## Transport

| Mode | Use case |
|------|----------|
| **stdio** | Local dev, Claude Desktop / Cursor config (the standalone binary) |

The server factory `createMcpServer({ agentLookup? })` also runs **in-process
inside the API**, where an `agentLookup` is injected so `verify_agent` can resolve
a stored credential by agent address. The standalone CLI has no storage, so there
it requires a full `credential` argument instead.

## Tool reference

All tools return a JSON text payload. Errors return `{ error, message }` with
`isError: true`.

### `gooddollar_verify_agent`

Confirm an AI agent is vouched for by a real, currently-verified GoodDollar human.

**Input** — provide **either** `agent` (look up a stored credential; only when the
host supplies an `agentLookup`) **or** `credential` (a full signed wire-form
credential to verify directly):

```json
{ "agent": "0x..." }
```
```json
{ "credential": { "fields": { "...": "..." }, "signature": "0x...", "chainId": 42220, "verifyingContract": "0x..." } }
```

**Output**

```json
{
  "found": true,
  "valid": true,
  "agent": "0x...",
  "operator": "0x...",
  "humanRoot": "0x...",
  "expiresAt": "1735689600",
  "reason": null
}
```

`valid` is true only if the signature recovers to `operator`, the credential is
not expired, and the operator is **still** a whitelisted GoodDollar identity (read
live on Celo). Unknown agents return `{ found: false, reason: "not_found" }`.

### `gooddollar_verify_status`

Check whether a wallet is a verified (whitelisted) GoodDollar identity, with its
root and expiry. Input `{ "wallet": "0x..." }`.

### `gooddollar_get_balance`

G$ token balance for a wallet (raw + formatted). Input `{ "wallet": "0x..." }`.

### `gooddollar_claim_eligibility`

Whether a wallet can claim its daily UBI now and the entitled amount. Input
`{ "wallet": "0x..." }`.

### `gooddollar_get_daily_stats`

GoodDollar UBI cycle stats for the current day. Input `{}`.

### `gooddollar_ping`

Check MCP + Celo RPC connectivity. Input `{}`.

## Client config (Claude Desktop / Cursor)

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

## Verify in code (without MCP)

The same verification is available directly via the SDK:

```ts
import { verifyAgentId, liveHumanRootLookup } from "@goodagent/agent-id";

const { valid, operator } = await verifyAgentId(credential, {
  humanRootLookup: liveHumanRootLookup,
});
```

## Safety

- Read-only: no `prepare`/`send` tools, no key access, never returns secrets.
- `verify_agent` re-reads the GoodDollar whitelist live; it does not trust a
  cached or self-asserted verification state.
- All numeric outputs are JSON-safe strings (bigints serialized to decimal).
