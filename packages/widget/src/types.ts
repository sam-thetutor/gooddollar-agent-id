import type { ReactNode } from "react";
import type { Address, Hex } from "viem";

/** Partner-supplied wallet — no key export; signs in the host app's embedded wallet. */
export interface GoodAgentWalletAdapter {
  address: Address | undefined;
  isConnected: boolean;
  /** Optional — widget shows a connect prompt if missing and not connected. */
  connect?: () => Promise<void>;
  signMessage: (message: string) => Promise<Hex>;
  signTypedData: (params: {
    domain: Record<string, unknown>;
    types: Record<string, ReadonlyArray<{ readonly name: string; readonly type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
  writeContract: (params: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<Hex>;
  /** Used to wait for tx receipts after writeContract. */
  waitForTransactionReceipt?: (hash: Hex) => Promise<unknown>;
}

export type SkillConfiguration = Record<string, string>;

/**
 * Partner-facing config — only pass what varies for your embed.
 * Static GoodAgent URLs, RPC, vault, registry, and skill defaults are filled in automatically.
 */
export interface GoodAgentWidgetPartnerConfig {
  /** Skill from https://goodagentids.xyz/skills */
  skillId: string;
  /** Your project slug for deploy attribution. */
  partnerId?: string;
  /** Overrides merged onto built-in skill defaults (PLAY_MODE, strategy, caps, …). */
  skillConfiguration?: SkillConfiguration;
  defaultDisplayName?: string;
  hideSkillConfig?: boolean;
  deployHint?: string;
  skillLabel?: string;
  telegramBotToken?: string;
  /** Face-verify return URL (default: current page in the browser). */
  fvCallbackUrl?: string;
  /** Advanced — only when self-hosting GoodAgent infrastructure. */
  hostBaseUrl?: string;
  apiBaseUrl?: string;
  rpcUrl?: string;
  vaultAddress?: Address;
  registryUrl?: string;
  goodDollarEnv?: "production" | "staging" | "development";
  deployTemplate?: "gaming" | "social" | "work";
  statusPollMs?: number;
}

/** Fully resolved config used inside the widget (after `resolveWidgetConfig`). */
export interface GoodAgentWidgetConfig {
  hostBaseUrl: string;
  apiBaseUrl: string;
  rpcUrl: string;
  skillId: string;
  skillConfiguration: SkillConfiguration;
  defaultDisplayName: string;
  deployTemplate: "gaming" | "social" | "work";
  hideSkillConfig: boolean;
  deployHint: string;
  skillLabel: string;
  partnerId?: string;
  telegramBotToken?: string;
  vaultAddress: Address;
  goodDollarEnv: "production" | "staging" | "development";
  fvCallbackUrl: string;
  statusPollMs: number;
  registryUrl: string;
}

export type GoodAgentWidgetMode = "deploy" | "vouch" | "dashboard" | "full";

export interface GoodAgentWidgetProps {
  config: GoodAgentWidgetPartnerConfig;
  wallet: GoodAgentWalletAdapter;
  /** Which surface to show. `full` = tabbed deploy → vouch → dashboard. */
  mode?: GoodAgentWidgetMode;
  /** Pre-selected deploy on the Verify tab (legacy: also used as dashboard default). */
  deployId?: string;
  /** Agent address for the Verify tab. */
  agentAddress?: string;
  /** Initial tab when mode is `full`. */
  initialTab?: "deploy" | "vouch" | "dashboard";
  /** Called when a new deploy job starts on the Deploy tab. */
  onDeployId?: (deployId: string) => void;
  /** Called when the user picks an agent on the Verify tab. */
  onVouchSelect?: (deployId: string, agentAddress: string) => void;
  /** Called when the user picks a deploy on the Dashboard tab. */
  onDashboardSelect?: (deployId: string) => void;
  /** Called after Agent ID is issued. */
  onVouched?: (agentAddress: string) => void;
  /** Called when agent reaches running status. */
  onLive?: (deployId: string) => void;
  className?: string;
  /** Replace built-in skill settings UI (advanced partners). */
  renderSkillConfig?: (props: {
    skillId: string;
    config: SkillConfiguration;
    onChange: (key: string, value: string) => void;
    telegramBotToken?: string;
    onTelegramBotTokenChange?: (value: string) => void;
  }) => ReactNode;
}

export {
  GAMEARENA_SKILL_ID,
  ACTIONORDER_SKILL_ID,
  UBI_REMINDER_SKILL_ID,
  BALAIO_WORKER_SKILL_ID,
  DEFAULT_GAMEARENA_CONFIG,
} from "./skill-config.js";
