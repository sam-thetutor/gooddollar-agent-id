# Widget integration examples

Copy these into your app. Replace `partnerId`, connect handler, and `fvCallbackUrl` as needed.

## 1. Marketplace + wagmi (Next.js / Reown)

See [README.md](./README.md#quick-start--marketplace-all-skills) for the full snippet.

## 2. Marketplace + Privy

```tsx
"use client";

import { GoodAgentWidget, createMarketplaceWidgetConfig } from "@goodagent/widget";
import { usePrivyWalletAdapter } from "@goodagent/widget/privy";
import "@goodagent/widget/styles.css";

export function GoodAgentSection() {
  const wallet = usePrivyWalletAdapter({ preferExternal: true });

  return (
    <GoodAgentWidget
      mode="full"
      wallet={wallet}
      config={createMarketplaceWidgetConfig({
        partnerId: "my-dapp",
      })}
    />
  );
}
```

## 3. Whitelist (e.g. gaming skills only)

```tsx
createMarketplaceWidgetConfig({
  partnerId: "my-dapp",
  allowedSkillIds: [
    "gaming/wagering/gamearena_1v1",
    "gaming/card-fighter/actionorder_vshouse",
  ],
  defaultSkillId: "gaming/wagering/gamearena_1v1",
});
```

## 4. GameArena preset (no skill picker)

```tsx
import { GoodAgentWidget, createGameArenaWidgetConfig } from "@goodagent/widget";

<GoodAgentWidget
  mode="full"
  wallet={wallet}
  config={createGameArenaWidgetConfig({
    partnerId: "gamearena",
    hideSkillConfig: false,
  })}
/>
```

## 5. Deploy-only surface

```tsx
<GoodAgentWidget mode="deploy" wallet={wallet} config={config} />
```

## 6. Scoped theme (CSS)

```css
.my-embed .ga-widget {
  --ga-bg: #ffffff;
  --ga-surface: #f5f3f0;
  --ga-border: #141414;
  --ga-text: #141414;
  --ga-primary: #fcff52;
  --ga-primary-hover: #f0f34a;
}
```

```tsx
<div className="my-embed">
  <GoodAgentWidget ... />
</div>
```
