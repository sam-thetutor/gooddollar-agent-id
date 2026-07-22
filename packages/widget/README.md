# @goodagent/widget

Embeddable GoodAgent UI for **any listed skill** on [goodagentids.xyz/skills](https://goodagentids.xyz/skills). Partners embed deploy → vouch → dashboard using the user’s wallet on their site — no private key export.

## Install

```bash
pnpm add @goodagent/widget
# peer: react, react-dom
# optional peer for Privy sites: @privy-io/react-auth
```

## Quick integration (any skill)

Pick your skill id from the [GoodAgent registry](https://goodagentids.xyz/skills) or [goodagent-skills/registry.json](https://github.com/sam-thetutor/goodagent-skills/blob/main/registry.json).

```tsx
import { GoodAgentWidget, usePrivyWalletAdapter, createGoodAgentWidgetConfig, GAMEARENA_SKILL_ID } from "@goodagent/widget";
import "@goodagent/widget/styles.css";

function PartnerAgentPanel() {
  const wallet = usePrivyWalletAdapter({ preferExternal: true });

  return (
    <GoodAgentWidget
      mode="full"
      wallet={wallet}
      config={{
        hostBaseUrl: "https://goodagentids.xyz/host",
        apiBaseUrl: "https://goodagentids.xyz/api",
        skillId: ACTIONORDER_SKILL_ID, // or any listed skill id
        partnerId: "your-project-slug",
        fvCallbackUrl: window.location.href,
      }}
    />
  );
}
```

The widget handles: deploy → pipeline → GoodDollar verify → G$ bond → Agent ID → start → dashboard.

## Config reference

| Field | Required | Description |
|-------|----------|-------------|
| `hostBaseUrl` | yes | GoodAgent host API |
| `apiBaseUrl` | yes | GoodAgent main API |
| `skillId` | yes | Skill from registry, e.g. `gaming/wagering/gamearena_1v1` |
| `partnerId` | no | Attribution tag (`referrer` on deploy) |
| `skillConfiguration` | no | Env overrides merged onto skill defaults |
| `defaultDisplayName` | no | Prefilled agent name |
| `hideSkillConfig` | no | Hide settings form (pre-configured embeds) |
| `deployTemplate` | no | `gaming` / `social` / `work` (auto from skillId) |
| `telegramBotToken` | no | Required for UBI reminder skill |
| `skillLabel` / `deployHint` | no | Custom UI copy |
| `fvCallbackUrl` | no | GoodDollar face-verify return URL |

### Exported skill ids

- `GAMEARENA_SKILL_ID` — `gaming/wagering/gamearena_1v1`
- `ACTIONORDER_SKILL_ID` — `gaming/card-fighter/actionorder_vshouse`
- `UBI_REMINDER_SKILL_ID` — `social/reminder/ubi_claim_reminder`
- `BALAIO_WORKER_SKILL_ID` — `work/marketplace/balaio_worker`

Use `defaultConfigForSkill(skillId)` for defaults matching goodagentids.xyz.

## Integration patterns

### 1. Game Arena (Privy + embedded wallet)

```tsx
const wallet = usePrivyWalletAdapter({ preferExternal: true });

<GoodAgentWidget
  config={createGoodAgentWidgetConfig(GAMEARENA_SKILL_ID, {
    partnerId: "gamearena",
  })}
  wallet={wallet}
/>
```

### 2. ACTION-ORDER / vs-house game

```tsx
<GoodAgentWidget
  config={createGoodAgentWidgetConfig(ACTIONORDER_SKILL_ID, {
    partnerId: "action-order",
    skillConfiguration: { CHARACTER_ID: "mira", STRATEGY: "rush" },
  })}
  wallet={wallet}
/>
```

Built-in form: character, strategy, difficulty, daily cap.

### 3. Pre-configured (no settings UI)

```tsx
<GoodAgentWidget
  config={{
    skillId: GAMEARENA_SKILL_ID,
    partnerId: "gamearena",
    hideSkillConfig: true,
    skillConfiguration: {
      PLAY_MODE: "offchain",
      MARKOV_STRATEGY: "random",
      DAILY_MATCH_CAP: "50",
    },
    defaultDisplayName: "Arena Bot",
    hostBaseUrl: "...",
    apiBaseUrl: "...",
  }}
  wallet={wallet}
/>
```

### 4. Custom settings UI

```tsx
<GoodAgentWidget
  renderSkillConfig={({ config, onChange }) => (
    <MyCustomFields values={config} onChange={onChange} />
  )}
  config={{ skillId: "...", hostBaseUrl: "...", apiBaseUrl: "..." }}
  wallet={wallet}
/>
```

### 5. wagmi (non-Privy sites)

```tsx
import { createWalletAdapterFromHooks } from "@goodagent/widget";
import { useAccount, useSignMessage, useSignTypedData, useWriteContract, useWaitForTransactionReceipt } from "wagmi";

const wallet = createWalletAdapterFromHooks({ ...wagmiHooks });
```

## Wallet adapters

| Site stack | Adapter |
|------------|---------|
| Privy (Game Arena) | `usePrivyWalletAdapter()` |
| wagmi | `createWalletAdapterFromHooks()` |
| Custom | Implement `GoodAgentWalletAdapter` |

## Modes

| `mode` | Shows |
|--------|--------|
| `"full"` | Deploy → Verify → Dashboard |
| `"deploy"` | Deploy only |
| `"vouch"` | Vouch only |
| `"dashboard"` | Dashboard only |

## Architecture

- **User wallet** (on partner site) — owns deploy, signs vouch, pause/resume
- **Agent play wallet** (GoodAgent server) — runs the skill; never exposed

## Headless API

`createHostClient`, `createApiClient`, `fetchSkillRegistry`, `defaultConfigForSkill` — use without React if you build your own UI.
