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

export interface GoodAgentWidgetConfig {
  /** Host supervisor API base (default: https://goodagentids.xyz/host). */
  hostBaseUrl: string;
  /** Main GoodAgent API base (default: https://goodagentids.xyz/api). */
  apiBaseUrl: string;
  /** Celo JSON-RPC for on-chain reads (vault, attestation). */
  rpcUrl?: string;
  /**
   * Skill to deploy — any listed skill from the GoodAgent registry
   * (https://goodagentids.xyz/skills). Required for partner embeds.
   */
  skillId: string;
  /** Initial skill env overrides (merged onto registry defaults). */
  skillConfiguration?: SkillConfiguration;
  /** Default agent display name in the deploy form. */
  defaultDisplayName?: string;
  /** Host deploy template (auto-detected from skillId when omitted). */
  deployTemplate?: "gaming" | "social" | "work";
  /** Telegram bot token — required for `social/reminder/ubi_claim_reminder`. */
  telegramBotToken?: string;
  /** Hide built-in skill settings (use when you pre-set skillConfiguration). */
  hideSkillConfig?: boolean;
  /** Override deploy panel subtitle. */
  deployHint?: string;
  /** Override skill label in UI (else derived from skillId). */
  skillLabel?: string;
  /** Partner attribution (stored on deploy when host supports it). */
  partnerId?: string;
  /** AgentVault on Celo mainnet. */
  vaultAddress?: Address;
  /** GoodDollar environment for face verification. */
  goodDollarEnv?: "production" | "staging" | "development";
  /** Face-verification return URL (defaults to current page URL). */
  fvCallbackUrl?: string;
  /** Poll interval for deploy status (ms). */
  statusPollMs?: number;
  /** Skill registry URL (for optional metadata fetch). */
  registryUrl?: string;
}

export type GoodAgentWidgetMode = "deploy" | "vouch" | "dashboard" | "full";

export interface GoodAgentWidgetProps {
  config: GoodAgentWidgetConfig;
  wallet: GoodAgentWalletAdapter;
  /** Which surface to show. `full` = tabbed deploy → vouch → dashboard. */
  mode?: GoodAgentWidgetMode;
  /** Pre-selected deploy id (dashboard / resume). */
  deployId?: string;
  /** Agent address for vouch step (from deploy status). */
  agentAddress?: string;
  /** Called when deploy id is known (after create). */
  onDeployId?: (deployId: string) => void;
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
