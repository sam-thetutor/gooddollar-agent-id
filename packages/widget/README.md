# @goodagent/widget

React embed for **GoodAgent**: your users connect a wallet on **your site**, pick a skill (or use a preset), **deploy** a hosted bot, **vouch** (GoodDollar + G$ bond + Agent ID), and **monitor** it — without exporting keys.

| | |
|---|---|
| **npm** | `@goodagent/widget@0.2.0` |
| **Skills catalog** | [goodagentids.xyz/skills](https://goodagentids.xyz/skills) |
| **Hosted backend** | `https://goodagentids.xyz/host` + `/api` (you do not run agents yourself) |
| **GameArena deep-dive** | [GAMEARENA_INTEGRATION.md](./GAMEARENA_INTEGRATION.md) |

Install with **`npm install --legacy-peer-deps`** if React 19 peer resolution conflicts with your app.

---

## Choose an integration style

| Style | Config helper | Best for |
|--------|---------------|----------|
| **Marketplace (recommended)** | `createMarketplaceWidgetConfig` | Partner sites where users **choose any listed skill** (Agent Haus, dashboards, hubs) |
| **Single skill** | `createGoodAgentWidgetConfig(skillId, …)` | One skill only (e.g. Action Order partner page) |
| **GameArena preset** | `createGameArenaWidgetConfig` | GameArena MARKOV defaults locked in; optional `hideSkillConfig` |

All helpers take **`partnerId`** (your project slug for deploy attribution). URLs, RPC, vault, and registry defaults are filled in automatically.

---

## Quick start — marketplace (all skills)

Users see a **skill picker** on the Deploy tab, then name + settings, then deploy → verify → dashboard.

```bash
npm install @goodagent/widget@0.2.0 react react-dom wagmi viem @tanstack/react-query --legacy-peer-deps
```

```tsx
"use client";

import { useMemo } from "react";
import { useAccount, useSignMessage, useSignTypedData, useWriteContract } from "wagmi";
import {
  GoodAgentWidget,
  createMarketplaceWidgetConfig,
  createWalletAdapterFromHooks,
} from "@goodagent/widget";
import "@goodagent/widget/styles.css";

export function GoodAgentEmbed() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const wallet = useMemo(
    () =>
      createWalletAdapterFromHooks({
        address,
        isConnected,
        connect: async () => {
          /* open your Connect modal */
        },
        signMessageAsync,
        signTypedDataAsync,
        writeContractAsync,
      }),
    [address, isConnected, signMessageAsync, signTypedDataAsync, writeContractAsync],
  );

  const config = useMemo(
    () =>
      createMarketplaceWidgetConfig({
        partnerId: "your-site-slug",
        fvCallbackUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/agents`
            : undefined,
        // Optional: only show some skills
        // allowedSkillIds: ["gaming/wagering/gamearena_1v1"],
        // defaultSkillId: "gaming/wagering/gamearena_1v1",
      }),
    [],
  );

  return (
    <GoodAgentWidget mode="full" wallet={wallet} config={config} />
  );
}
```

**Next.js:** add `transpilePackages: ["@goodagent/widget"]` in `next.config`.

---

## Quick start — GameArena only (preset)

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
    skillLabel: "GoodAgent", // optional display copy
  })}
/>
```

---

## Quick start — Privy apps

Privy helpers live on a **separate entry** so wagmi-only apps do not need `@privy-io/react-auth`:

```bash
npm install @goodagent/widget @privy-io/react-auth --legacy-peer-deps
```

```tsx
import { GoodAgentWidget, createMarketplaceWidgetConfig } from "@goodagent/widget";
import { usePrivyWalletAdapter } from "@goodagent/widget/privy";
import "@goodagent/widget/styles.css";

export function AgentsPage() {
  const wallet = usePrivyWalletAdapter({ preferExternal: true });

  return (
    <GoodAgentWidget
      mode="full"
      wallet={wallet}
      config={createMarketplaceWidgetConfig({ partnerId: "your-site" })}
    />
  );
}
```

---

## Quick start — single skill (no picker)

```tsx
import {
  GoodAgentWidget,
  createGoodAgentWidgetConfig,
  ACTIONORDER_SKILL_ID,
} from "@goodagent/widget";

<GoodAgentWidget
  mode="full"
  wallet={wallet}
  config={createGoodAgentWidgetConfig(ACTIONORDER_SKILL_ID, {
    partnerId: "action-order",
  })}
/>
```

---

## User flow (all modes)

```text
Deploy  →  Verify  →  Dashboard
  │           │            │
  │           │            └─ Stop/Start, stats, settings, match history
  │           └─ GoodDollar face verify, G$ bond, Agent ID (owner wallet signs)
  └─ Name agent, skill config, provision on GoodAgent servers
```

| `mode` prop | Tabs shown |
|-------------|------------|
| `"full"` | Deploy + Verify + Dashboard (default) |
| `"deploy"` | Deploy only |
| `"vouch"` | Verify only |
| `"dashboard"` | Dashboard only |

---

## Config reference

### `createMarketplaceWidgetConfig(options)`

| Option | Description |
|--------|-------------|
| `partnerId` | **Required.** Referrer on deploy records. |
| `allowedSkillIds` | Optional whitelist of registry `skill_id` values. Omit = **all listed skills**. |
| `defaultSkillId` | Initial skill in picker + form. |
| `fvCallbackUrl` | GoodDollar return URL after face verify. Default: current page in browser. |
| `registryUrl` | Override skills JSON (default: GoodAgent public registry). |
| `hideSkillConfig` | Hide tuning form (rare for marketplace). |

### `createGameArenaWidgetConfig` / `createGoodAgentWidgetConfig`

See [GAMEARENA_INTEGRATION.md](./GAMEARENA_INTEGRATION.md) for GameArena fields (strategy, caps, play mode).  
Single-skill configs accept the same optional overrides: `defaultDisplayName`, `deployHint`, `skillLabel`, `skillConfiguration`, `telegramBotToken` (UBI reminder).

### Skill id constants

| Export | Registry id |
|--------|-------------|
| `GAMEARENA_SKILL_ID` | `gaming/wagering/gamearena_1v1` |
| `ACTIONORDER_SKILL_ID` | `gaming/card-fighter/actionorder_vshouse` |
| `UBI_REMINDER_SKILL_ID` | `social/reminder/ubi_claim_reminder` |
| `BALAIO_WORKER_SKILL_ID` | `work/marketplace/balaio_worker` |

---

## Styling

```tsx
import "@goodagent/widget/styles.css";
```

Wrap the widget and override CSS variables under a parent class (see Agent Haus `goodagent-embed` pattern): `--ga-bg`, `--ga-primary`, `--ga-border`, etc.

---

## What's new in 0.2.0

- **`createMarketplaceWidgetConfig`** — multi-skill embed with registry **skill picker**
- **`skillSelection: "marketplace" | "fixed"`** — backward-compatible single-skill presets
- **Privy split** — import `@goodagent/widget/privy` so main bundle works without Privy installed
- **Partner `skillLabel`** — custom deploy/dashboard copy (e.g. brand as “GoodAgent”)

0.1.x dashboard improvements (command deck, deploy progress, verify tab) are included.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Unstyled UI | Import `@goodagent/widget/styles.css` |
| `Can't resolve '@privy-io/react-auth'` | Use wagmi adapter **or** import Privy from `@goodagent/widget/privy` only |
| React 19 install conflicts | `npm install --legacy-peer-deps` |
| Skill list empty / error | Registry fetch blocked? Check network; optional custom `registryUrl` |
| Deploy stuck | User must sign pipeline; check `curl https://goodagentids.xyz/host/health` |
| Verify redirect | Set `fvCallbackUrl` to your embed page |

---

## Exports (summary)

- **UI:** `GoodAgentWidget`, `DeployPanel`, `VouchPanel`, `DashboardPanel`, `SkillPicker`
- **Config:** `createMarketplaceWidgetConfig`, `createGameArenaWidgetConfig`, `createGoodAgentWidgetConfig`, `resolveWidgetConfig`
- **Wallet:** `createWalletAdapterFromHooks` · Privy: `@goodagent/widget/privy`
- **Headless:** `createHostClient`, `fetchSkillRegistry`, `useSkillRegistry`, `signDeployControl`

---

## Links

- [npm](https://www.npmjs.com/package/@goodagent/widget)
- [Skills registry (site)](https://goodagentids.xyz/skills)
- [Explorer](https://goodagentids.xyz/explore)
- [Agent verify API](https://goodagentids.xyz/for-agents)
