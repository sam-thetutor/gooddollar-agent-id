# GoodAgent Quickstart — zero to live on Celo mainnet

> **5 steps · ~10 minutes** for an AI agent to go from a fresh wallet to a
> human-backed, bond-backed GoodAgent identity on Celo mainnet.

**Live site:** https://goodagentids.xyz  
**API:** https://gcopilot-api.geinz.lol  
**Demo agent:** `0xBd4495328ac79B2E4A4B488Eb0D4b3548833Ad2A` (attested on mainnet)

---

## Who does what

| Role | Job |
|------|-----|
| **Agent** (your agent's wallet) | Attest that it controls its address on-chain |
| **Operator** (GoodDollar-verified human) | Stake a refundable 250 G$ bond and sign the credential |
| **Verifier** (anyone) | `GET /agent/verify/:address` — live verdict, no auth |

The agent never holds the operator's keys. The operator signs in their own wallet.

---

## Step 1 — Agent: create a wallet

Generate a dedicated Celo address for your agent (one key per agent).

```bash
npm install viem
node -e "
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const pk = generatePrivateKey();
const acc = privateKeyToAccount(pk);
console.log('address:', acc.address);
console.log('privateKey:', pk);
"
```

Save the private key securely. **Never commit it to git.**

---

## Step 2 — Agent: attest on-chain (required)

Prove you control the address in the `AgentAttestation` registry
(`0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2`).

```bash
npm install @goodagent/agent-id viem
```

```ts
import { attestAsAgent } from "@goodagent/agent-id";
// A. Agent holds CELO — one tx from the agent wallet:
await attestAsAgent(agentWalletClient);

// B. No gas — sign offline, anyone relays:
import { signAgentAttestation, relayAgentAttestation } from "@goodagent/agent-id";
const signed = await signAgentAttestation(agentAccount);
await relayAgentAttestation(relayerWalletClient, signed);
```

**Check attestation:**

```bash
curl https://gcopilot-api.geinz.lol/agent/verify/0xYOUR_AGENT
# agentProven: true once attested (even before full registration)
```

MCP: `gooddollar_check_attestation` with `{ "agent": "0x…" }`.

---

## Step 3 — Operator: vouch at /issue

Your human operator must:

1. Be **GoodDollar face-verified** at https://wallet.gooddollar.org
2. Hold **≥ 250 G$** on Celo
3. Open **https://goodagentids.xyz/issue** (or
   `https://goodagentids.xyz/issue?agent=0xYOUR_AGENT` with the address prefilled)
4. **Approve** G$ → **Stake** 250 G$ into `AgentVault` for the agent
5. **Sign** the EIP-712 credential in MetaMask

The UI blocks submission until the agent is attested and the bond is in place.

**Operator CLI (optional):** if you prefer a script instead of the web UI:

```bash
cd apps/api
OPERATOR_PRIVATE_KEY=0xYourVerifiedOperatorKey npx tsx register-demo-agent.mts
```

Set `DEMO_AGENT_ADDRESS` to your agent if not using the canonical demo.

---

## Step 4 — Agent: poll until live

```bash
curl https://gcopilot-api.geinz.lol/agent/verify/0xYOUR_AGENT
```

Success:

```json
{
  "found": true,
  "valid": true,
  "agentProven": true,
  "operator": "0x…",
  "humanRoot": "0x…",
  "bondChecked": true,
  "revocationChecked": true
}
```

Or poll in code:

```ts
const url = "https://gcopilot-api.geinz.lol/agent/verify/0xYOUR_AGENT";
for (;;) {
  const r = await (await fetch(url)).json();
  if (r.found && r.valid) break;
  await new Promise((s) => setTimeout(s, 30_000));
}
```

---

## Step 5 — Verifiers: check any agent

Three equivalent surfaces:

```bash
# REST (by address — no credential needed)
curl https://gcopilot-api.geinz.lol/agent/verify/0xAGENT
```

```ts
// SDK (with full credential wire object)
import { verifyAgentIdLive } from "@goodagent/agent-id";
const result = await verifyAgentIdLive(credential);
```

```json
// MCP — add to Cursor / Claude Desktop:
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

Tools: `gooddollar_verify_agent`, `gooddollar_check_attestation`,
`gooddollar_verify_status`, `gooddollar_ping`.

**Browser explorer:** https://goodagentids.xyz/explore

---

## Demo agent (copy this flow)

| Field | Value |
|-------|-------|
| Name | GoodAgent Demo |
| Address | `0xBd4495328ac79B2E4A4B488Eb0D4b3548833Ad2A` |
| Attestation | On-chain (`AgentAttestation` registry) |
| Verify | https://gcopilot-api.geinz.lol/agent/verify/0xBd4495328ac79B2E4A4B488Eb0D4b3548833Ad2A |
| Profile | https://goodagentids.xyz/explore/agent/0xBd4495328ac79B2E4A4B488Eb0D4b3548833Ad2A |
| Vouch (operator) | https://goodagentids.xyz/issue?agent=0xBd4495328ac79B2E4A4B488Eb0D4b3548833Ad2A |

After an operator completes Step 3, the demo agent returns
`{ "found": true, "valid": true, "agentProven": true }`.

---

## Paste into your agent (one-liner)

```
Read https://goodagentids.xyz/llms.txt and follow it to become a human-backed agent: attest your wallet key on Celo, then ask your human operator to vouch for you at https://goodagentids.xyz/issue
```

---

## Runnable examples

```bash
pnpm --filter @goodagent/examples agent     # agent lifecycle (attest + auth)
pnpm --filter @goodagent/examples verify    # SDK sign + verify
pnpm --filter @goodagent/examples register  # on-chain HumanProofProvider
```

---

## More detail

- Machine-readable agent guide: https://goodagentids.xyz/llms.txt
- Human-readable reference: https://goodagentids.xyz/for-agents
- SDK: https://www.npmjs.com/package/@goodagent/agent-id
- MCP: https://www.npmjs.com/package/@goodagent/mcp-server
