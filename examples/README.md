# Examples — GoodDollar Agent ID SDK

Runnable demos for the `@goodagent/agent-id` SDK.

## agent-lifecycle.mjs

The **agent's side** of the system — registration is agent-first, so this is
where a new agent starts:

1. **Attest** — sign the `AttestAgent` message offline (`signAgentAttestation`);
   anyone can relay it on-chain via `relayAgentAttestation`. Required before an
   operator can register you.
2. **Check** — read the live `AgentAttestation` registry (`isAgentAttested`).
3. **Authenticate** — sign a fresh `AgentAuth` challenge and verify it
   (`signAgentAuth` / `verifyAgentAuth`), including a forged-signature rejection.

```bash
pnpm --filter @goodagent/examples agent
# or, from this folder:  node agent-lifecycle.mjs
```

No gas needed — on-chain interactions are read-only; the attest signature is
printed instead of relayed.

## verify-agent.mjs

End-to-end, **SDK-only** flow (no server needed):

1. An operator issues + EIP-712-signs an Agent ID credential.
2. Anyone verifies it with `verifyAgentIdLive` — signature + expiry plus **live**
   on-chain reads of the human root, the G$ bond, the revocation registry, and
   the agent's key attestation (`bondChecked` / `revocationChecked` /
   `agentProven` flags in the result).
3. The credential is wrapped as an **ERC-8004** registration file and verified back out.

```bash
pnpm --filter @goodagent/examples verify
# or, from this folder:  node verify-agent.mjs

# Optionally live-check any address's GoodDollar verification status:
CHECK_OPERATOR=0xYourGoodDollarVerifiedAddress node verify-agent.mjs
```

The throwaway operator key is intentionally *not* GoodDollar-verified, so the
live check returns `operator_not_verified` — proving the on-chain verification is
real, not mocked. A genuinely verified operator's signature yields `valid: true`.

## register-onchain.mjs

Tests the **real ERC-8004 registration primitive**: it reproduces exactly what an
`IERC8004ProofOfHuman` registry does on `registerWithHumanProof(...)` — builds the
`proof` (the human's EIP-712 consent) + `data` with the SDK, then calls the
**deployed** `GoodDollarHumanProofProvider` on Celo mainnet
(`0x80c4de6872049cb20989156bca50134c781f48c9`).

```bash
# Use a GoodDollar face-verified wallet to get a real "verified" result:
OPERATOR_PRIVATE_KEY=0xYourVerifiedKey \
AGENT_ADDRESS=0xYourAgentWallet \
pnpm --filter @goodagent/examples register
# or, from this folder:  OPERATOR_PRIVATE_KEY=0x... node register-onchain.mjs
```

A verified wallet returns `verified = true` + a deterministic per-human
nullifier (what a registry would bind for sybil limits). An unverified wallet
returns `verified = false`. Either way it asserts the SDK's EIP-712 digest equals
the contract's on-chain `proofDigest`.

## Verify from a real AI agent runtime (MCP)

To test from a *standard agent* (Claude Desktop, Cursor, any MCP client), point it
at the published MCP server — no install:

```json
{
  "mcpServers": {
    "gooddollar": {
      "command": "npx",
      "args": ["-y", "@goodagent/mcp-server"],
      "env": { "CELO_RPC_URL": "https://forno.celo.org" }
    }
  }
}
```

Then ask the agent things like *"Is wallet 0x… a verified GoodDollar human?"*
(`gooddollar_verify_status`) or hand it a signed credential to check
(`gooddollar_verify_agent`).
