# GameArena × GoodAgent — integration guide

**For:** GameArena team  
**Goal:** Let your users deploy autonomous agents that play the **free offchain Markov AI** game (`challenge-ai` / rock-paper-scissors vs MARKOV).  
**Backend:** GoodAgent hosts provisioning and gameplay — **you do not run agent servers**.

**Widget package:** `@goodagent/widget@0.1.5`  
**GoodAgent APIs:** `https://goodagentids.xyz/host` + `https://goodagentids.xyz/api` (filled in automatically — do not configure in your app)

---

## TL;DR (fastest path)

1. `pnpm add @goodagent/widget@0.1.5`
2. Drop in the widget on an `/agents` (or similar) page
3. Use **`partnerId: "gamearena"`** so deploys are attributed to you
4. Users **name their agent** and **tune bot settings** on the Deploy tab (strategy, caps, interval)
5. Optionally set **`fvCallbackUrl`** if your agents page is not the current URL (GoodDollar face-verify return)

Done — users connect wallet → deploy → vouch → agent plays automatically.

---

## What your users get

| Step | Tab | User action | What happens |
|------|-----|-------------|--------------|
| 1 | **Deploy** | Name agent + tune settings + deploy | GoodAgent creates a **play wallet**, registers GameArena username, installs skill |
| 2 | **Verify** | GoodDollar verify + G$ bond + Agent ID | User’s **connected wallet** signs; agent becomes verifiable on GoodAgent |
| 3 | **Dashboard** | Monitor / Stop / Start | Live status, match stats, controls |

**Important:** The user’s wallet **owns** the agent. The **play wallet** runs on GoodAgent servers — keys are never exported to your frontend.

**Offchain mode:** Default play mode is **free tickets** vs MARKOV AI. Users can change play mode in the Deploy form if you leave settings visible (default).

### What users configure on Deploy (default)

| Field | What it does |
|-------|----------------|
| **Agent name** | Display name → becomes GameArena Pass username on-chain (sanitized) |
| **Strategy vs MARKOV** | random / sequence / fixed / counter |
| **Daily match cap** | Max matches per UTC day |
| **Max matches per run** | Matches before the bot pauses until next start |
| **Pause between matches** | Seconds between games |
| **Play mode** | Free tickets (offchain) — recommend leaving default for your integration |

GoodAgent fills in host API, main API, RPC, vault, and base skill defaults. You only pass `partnerId` (and optional overrides).

---

## Install

```bash
pnpm add @goodagent/widget@0.1.5 react react-dom

# If you already use Privy (recommended for GameArena / MiniPay / WalletConnect):
pnpm add @privy-io/react-auth
```

---

## Recommended config (offchain Markov — copy this)

GoodAgent fills in API URLs, RPC, vault, skill defaults, and face-verify callback automatically. You only pass what varies:

```tsx
import {
  GoodAgentWidget,
  createGameArenaWidgetConfig,
  usePrivyWalletAdapter,
} from "@goodagent/widget";
import "@goodagent/widget/styles.css";

export function GameArenaAgentsPanel() {
  const wallet = usePrivyWalletAdapter({ preferExternal: true });

  return (
    <GoodAgentWidget
      mode="full"
      wallet={wallet}
      config={createGameArenaWidgetConfig({
        partnerId: "gamearena",
      })}
    />
  );
}
```

Need a custom agents page path for GoodDollar return? Pass `fvCallbackUrl` only:

```tsx
config={createGameArenaWidgetConfig({
  partnerId: "gamearena",
  fvCallbackUrl:
    typeof window !== "undefined"
      ? `${window.location.origin}/agents`
      : undefined,
})}
```

### Full control (any skill)

```tsx
import { createGoodAgentWidgetConfig, GAMEARENA_SKILL_ID } from "@goodagent/widget";

config={createGoodAgentWidgetConfig(GAMEARENA_SKILL_ID, {
  partnerId: "gamearena",
  skillConfiguration: { PLAY_MODE: "offchain", MARKOV_STRATEGY: "random" },
})}
```

Users see strategy, daily cap, max matches per run, pause between matches, and play mode on the Deploy tab. Set `hideSkillConfig: true` only if you want a name-only deploy with locked defaults.

### Why these settings?

| Setting | Value | Meaning |
|---------|-------|---------|
| `PLAY_MODE` | `offchain` | Free tickets — no G$ wager per match |
| `MARKOV_STRATEGY` | `random` | Plays vs MARKOV AI (random RPS strategy) |
| `DAILY_MATCH_CAP` | `50` | Max matches per UTC day |
| `MAX_MATCHES` | `10` | Matches per agent run before idle |
| `MATCH_INTERVAL_SECONDS` | `300` | Pause between matches (5 min) |
| `GAME_TYPE` | `0` | Default GameArena game type |

Other strategies if you want a dropdown later: `sequence`, `fixed`, `counter` (see widget source).

---

## Full page example (Privy)

Your app must already wrap the tree in `<PrivyProvider>` with Celo mainnet configured.

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

  if (!wallet.isConnected) {
    return (
      <main>
        <h1>Deploy your GameArena agent</h1>
        <p>Connect a Celo wallet to deploy an autonomous MARKOV player.</p>
        <button type="button" onClick={() => void wallet.connect?.()}>
          Connect wallet
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>Deploy your GameArena agent</h1>
      <p>
        Your wallet owns the agent. GoodAgent provisions and runs gameplay — no
        private key export.
      </p>

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
    </main>
  );
}
```

**Styles:** Import `@goodagent/widget/styles.css` once. Wrap in your own card/container as needed (dark UI works well).

---

## Alternative: wagmi (no Privy)

If you use wagmi + MetaMask / WalletConnect instead of Privy:

```tsx
import { createWalletAdapterFromHooks } from "@goodagent/widget";
import {
  useAccount,
  useConnect,
  useSignMessage,
  useSignTypedData,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

function useGameArenaWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const { waitForTransactionReceipt } = useWaitForTransactionReceipt();

  return createWalletAdapterFromHooks({
    address,
    isConnected,
    connect: async () => {
      const c = connectors[0];
      if (c) await connect({ connector: c });
    },
    signMessageAsync,
    signTypedDataAsync,
    writeContractAsync,
    waitForTransactionReceipt,
  });
}
```

Use `preferExternal`-style behavior by connecting the user’s primary wallet before rendering the widget.

---

## Optional: hide settings (name-only deploy)

If you want users to **only** name their agent and skip tuning, lock the form:

```tsx
createGameArenaWidgetConfig({
  partnerId: "gamearena",
  hideSkillConfig: true,
})
```

## Optional: show settings to power users

**Default:** settings are shown. Users can pick:

- Strategy vs MARKOV (random / sequence / fixed / counter)
- Daily match cap
- Max matches per run
- Pause between matches
- Play mode (keep default **Free tickets** / `offchain`)

---

## Optional: single tab only

```tsx
<GoodAgentWidget mode="deploy" ... />   // deploy only
<GoodAgentWidget mode="vouch" deployId="..." agentAddress="0x..." ... />
<GoodAgentWidget mode="dashboard" ... /> // monitor existing agents
```

For most GameArena flows, **`mode="full"`** (three tabs) is simplest.

---

## What you do **not** need to build

| You skip | GoodAgent handles |
|----------|-------------------|
| Agent server / PM2 | Host provisions & runs agents |
| Play wallet key management | Created & stored on GoodAgent host |
| GameArena API integration in your backend | Skill runs on agent play wallet |
| Deploy API | `POST /host/deploy` |
| Verify API | `GET /api/agent/verify/:address` |
| Start / stop | Signed `pause` / `resume` via widget |

---

## User flow checklist (for QA)

Use a **fresh Celo wallet** on staging/production:

- [ ] Connect wallet on your `/agents` page
- [ ] **Deploy** — enter name → deploy → sign pipeline start if prompted → status reaches “awaiting vouch” or similar
- [ ] **Verify** — complete GoodDollar face verification (returns to `fvCallbackUrl`)
- [ ] **Verify** — post G$ bond (on-chain tx from user wallet)
- [ ] **Verify** — issue Agent ID (sign + tx)
- [ ] **Dashboard** — agent shows **Running**, record/today update
- [ ] **Stop** then **Start** — controls work for wallet owner
- [ ] Agent appears on [goodagentids.xyz/explore](https://goodagentids.xyz/explore) after verify

**Health check:**

```bash
curl https://goodagentids.xyz/host/health
# → {"ok":true,"service":"goodagent-host",...}
```

---

## `partnerId` and attribution

Set **`partnerId: "gamearena"`** (or a slug we agree on). It is stored as `referrer` on deploy so you can filter your users’ agents on the GoodAgent side.

Tell us your preferred slug before launch if you want something other than `gamearena`.

---

## GoodDollar face verification (`fvCallbackUrl`)

Set `fvCallbackUrl` to the **exact URL** users land on after face verify — typically your agents page:

```tsx
fvCallbackUrl: `${window.location.origin}/agents`
```

Users must return to a page that still mounts the widget (Verify tab) so the flow can continue.

---

## Styling on GameArena

The widget ships self-contained CSS. Minimal wrapper:

```tsx
<div className="rounded-2xl border border-white/10 bg-black/40 p-6">
  <GoodAgentWidget ... />
</div>
```

Class prefix: `ga-widget-*`. Override in your CSS if needed; don’t strip the import.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Unstyled widget | Add `import "@goodagent/widget/styles.css"` |
| MetaMask sign never pops | Use `usePrivyWalletAdapter({ preferExternal: true })` or wagmi adapter |
| Deploy stuck on “provisioning” | User may need to sign “start pipeline”; check `/host/health` |
| Verify redirect loses state | `fvCallbackUrl` must match your agents page URL |
| Dashboard empty | User must complete Verify tab first |
| Agent not playing | Confirm `PLAY_MODE: "offchain"` and agent status **Running** on Dashboard |

---

## Links

| Resource | URL |
|----------|-----|
| npm package | https://www.npmjs.com/package/@goodagent/widget |
| Skill registry | https://goodagentids.xyz/skills |
| Agent explorer | https://goodagentids.xyz/explore |
| Host health | https://goodagentids.xyz/host/health |
| Generic widget README | See `@goodagent/widget` on npm (step-by-step for all skills) |

---

## Contact

For **`partnerId` setup**, host issues, or launch support, contact the GoodAgent team (Sam).

**Suggested launch order:** integrate on staging → one end-to-end test wallet → production route (e.g. `/agents`) → announce to users.
