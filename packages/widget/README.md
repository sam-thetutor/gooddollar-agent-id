# @goodagent/widget

Embeddable GoodAgent UI for **any listed skill** on [goodagentids.xyz/skills](https://goodagentids.xyz/skills). Partners embed deploy → vouch → dashboard on their site using the **user’s wallet** — no private key export.

**Latest:** `@goodagent/widget@0.1.6` (npm)  
**Backend:** `https://goodagentids.xyz/host` + `https://goodagentids.xyz/api` (hosted by GoodAgent — you do not run this yourself)

**Partner guide:** [GameArena integration](./GAMEARENA_INTEGRATION.md)

---

## Quick start (GameArena)

```bash
pnpm add @goodagent/widget@0.1.6 react react-dom
```

```tsx
"use client";

import {
  GoodAgentWidget,
  createGameArenaWidgetConfig,
  usePrivyWalletAdapter,
} from "@goodagent/widget";
import "@goodagent/widget/styles.css";

export default function AgentsPage() {
  const wallet = usePrivyWalletAdapter({ preferExternal: true });

  return (
    <GoodAgentWidget
      mode="full"
      wallet={wallet}
      config={createGameArenaWidgetConfig({ partnerId: "your-project-slug" })}
    />
  );
}
```

That’s it. You pass **`partnerId`** only. GoodAgent fills in API URLs, RPC, vault, registry, skill defaults, and the face-verify callback.

On **Deploy**, users name their agent and tune bot settings (strategy, match caps, interval). See [GameArena guide](./GAMEARENA_INTEGRATION.md) for details.

---

## What you configure vs what is automatic

| You pass (varies) | Filled in automatically |
|-------------------|-------------------------|
| `partnerId` | `hostBaseUrl` → `https://goodagentids.xyz/host` |
| `skillId` (or use GameArena preset) | `apiBaseUrl` → `https://goodagentids.xyz/api` |
| Optional `skillConfiguration` overrides | `rpcUrl`, `vaultAddress`, `registryUrl` |
| Optional `fvCallbackUrl` | Base skill env from registry |
| Optional `hideSkillConfig: true` to lock settings | `deployTemplate`, labels, hints, `goodDollarEnv` |
| Wallet adapter (Privy / wagmi) | `fvCallbackUrl` → current page URL in browser |

Use **`createGameArenaWidgetConfig({ partnerId })`** for GameArena offchain MARKOV agents.

Use **`createGoodAgentWidgetConfig(skillId, { partnerId })`** for any other skill.

Use **`resolveWidgetConfig({ ... })`** if you build config objects yourself.

---

## Step-by-step integration

### 1. Prerequisites

| Requirement | Notes |
|-------------|--------|
| **React 18+** | `react`, `react-dom` as peers |
| **Celo wallet** | User signs deploy, vouch, pause/resume |
| **Embed page** | e.g. `/agents` |

Wallet stack (pick one):

- **Privy** — `@privy-io/react-auth` + `<PrivyProvider>` on Celo
- **wagmi** — `wagmi` + `viem` + `<WagmiProvider>`

---

### 2. Install

```bash
pnpm add @goodagent/widget react react-dom

# Privy sites:
pnpm add @privy-io/react-auth

# wagmi sites:
pnpm add wagmi viem @tanstack/react-query
```

---

### 3. Wallet adapter

**Privy:**

```tsx
import { usePrivyWalletAdapter } from "@goodagent/widget";

const wallet = usePrivyWalletAdapter({ preferExternal: true });
```

**wagmi:**

```tsx
import { createWalletAdapterFromHooks } from "@goodagent/widget";
// wire useAccount, useSignMessage, useSignTypedData, useWriteContract, …
const wallet = createWalletAdapterFromHooks({ ...hooks });
```

---

### 4. Render the widget

**GameArena preset** (recommended for gamearenahq.xyz partners):

```tsx
import {
  GoodAgentWidget,
  createGameArenaWidgetConfig,
} from "@goodagent/widget";
import "@goodagent/widget/styles.css";

<GoodAgentWidget
  mode="full"
  wallet={wallet}
  config={createGameArenaWidgetConfig({
    partnerId: "gamearena",
    fvCallbackUrl:
      typeof window !== "undefined"
        ? `${window.location.origin}/agents`
        : undefined,
  })}
/>
```

**Any skill:**

```tsx
import {
  GoodAgentWidget,
  createGoodAgentWidgetConfig,
  ACTIONORDER_SKILL_ID,
} from "@goodagent/widget";

<GoodAgentWidget
  wallet={wallet}
  config={createGoodAgentWidgetConfig(ACTIONORDER_SKILL_ID, {
    partnerId: "action-order",
  })}
/>
```

**Raw partner config** (same as above, explicit skill id):

```tsx
<GoodAgentWidget
  wallet={wallet}
  config={{
    skillId: "gaming/wagering/gamearena_1v1",
    partnerId: "my-app",
  }}
/>
```

---

### 5. What users do on Deploy

**GameArena (default):** settings form is **shown**. Users configure:

| Field | Purpose |
|-------|---------|
| Agent name | Becomes GameArena Pass username on-chain (sanitized) |
| Strategy vs MARKOV | random / sequence / fixed / counter |
| Daily match cap | Max matches per UTC day |
| Max matches per run | Matches before idle |
| Pause between matches | Seconds between games |
| Play mode | Default offchain (free tickets) |

To hide the form and lock defaults (name-only deploy):

```tsx
createGameArenaWidgetConfig({
  partnerId: "gamearena",
  hideSkillConfig: true,
})
```

---

### 6. User flow

1. **Deploy** — name + tune settings → deploy → sign pipeline if prompted  
2. **Verify** — GoodDollar face verify → G$ bond → Agent ID  
3. **Dashboard** — balances, record, Stop/Start  

```bash
curl https://goodagentids.xyz/host/health
```

---

## Config helpers

| Helper | Use when |
|--------|----------|
| `createGameArenaWidgetConfig({ partnerId })` | GameArena offchain MARKOV embed |
| `createGoodAgentWidgetConfig(skillId, { partnerId })` | Any skill from registry |
| `resolveWidgetConfig({ skillId, partnerId, … })` | Building config programmatically |

### Partner config (`GoodAgentWidgetPartnerConfig`)

| Field | Required | Description |
|-------|----------|-------------|
| `skillId` | yes* | *Omitted when using `createGameArenaWidgetConfig` |
| `partnerId` | recommended | Stored as deploy referrer |
| `skillConfiguration` | no | Merged onto skill defaults |
| `defaultDisplayName` | no | Prefilled agent name |
| `hideSkillConfig` | no | `true` = hide tuning form (default **false** for GameArena preset) |
| `deployHint` / `skillLabel` | no | Custom UI copy |
| `telegramBotToken` | no | Required for UBI reminder skill |
| `fvCallbackUrl` | no | GoodDollar return URL (current page if omitted) |
| `hostBaseUrl` / `apiBaseUrl` | no | Self-host only |

### Skill id constants

| Export | Skill id |
|--------|----------|
| `GAMEARENA_SKILL_ID` | `gaming/wagering/gamearena_1v1` |
| `ACTIONORDER_SKILL_ID` | `gaming/card-fighter/actionorder_vshouse` |
| `UBI_REMINDER_SKILL_ID` | `social/reminder/ubi_claim_reminder` |
| `BALAIO_WORKER_SKILL_ID` | `work/marketplace/balaio_worker` |

---

## Widget modes

| `mode` | Shows |
|--------|--------|
| `"full"` | Deploy → Verify → Dashboard |
| `"deploy"` | Deploy only |
| `"vouch"` | Vouch only |
| `"dashboard"` | Dashboard only |

---

## Exports

**Components:** `GoodAgentWidget`, `DeployPanel`, `VouchPanel`, `DashboardPanel`

**Config:** `createGameArenaWidgetConfig`, `createGoodAgentWidgetConfig`, `resolveWidgetConfig`, `DEFAULT_WIDGET_API`

**Wallet:** `usePrivyWalletAdapter`, `createWalletAdapterFromHooks`, `createWalletAdapterFromPrivy`

**Headless:** `createHostClient`, `createApiClient`, `fetchSkillRegistry`, `signDeployControl`

**Types:** `GoodAgentWidgetPartnerConfig`, `GoodAgentWidgetConfig`, `GoodAgentWalletAdapter`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Unstyled widget | `import "@goodagent/widget/styles.css"` |
| Signing hangs (MetaMask) | `usePrivyWalletAdapter({ preferExternal: true })` or wagmi adapter |
| Deploy stuck provisioning | Check `/host/health`; user signs pipeline start |
| Verify redirect fails | Set `fvCallbackUrl` to your agents page URL |
| Dashboard slow | Host serves lite status first; full stats follow |

---

## Links

- [npm package](https://www.npmjs.com/package/@goodagent/widget)
- [Skills registry](https://goodagentids.xyz/skills)
- [Agent explorer](https://goodagentids.xyz/explore)
- [GameArena partner guide](./GAMEARENA_INTEGRATION.md)
- [For agents / verify API](https://goodagentids.xyz/for-agents)
