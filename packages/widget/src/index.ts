/**
 * @goodagent/widget — embeddable deploy / vouch / dashboard for partner sites.
 *
 * @example
 * ```tsx
 * import { GoodAgentWidget, createGameArenaWidgetConfig } from "@goodagent/widget";
 * import "@goodagent/widget/styles.css";
 *
 * <GoodAgentWidget
 *   config={createGameArenaWidgetConfig({ partnerId: "gamearena" })}
 *   wallet={wallet}
 *   mode="full"
 * />
 * ```
 */

export { GoodAgentWidget } from "./components/GoodAgentWidget.js";
export { DeployPanel } from "./components/DeployPanel.js";
export { VouchPanel } from "./components/VouchPanel.js";
export { AgentDetailPanel } from "./components/AgentDetailPanel.js";
export { DashboardPanel } from "./components/DashboardPanel.js";

export { WidgetProvider, useWidget } from "./context.js";

export { createHostClient } from "./client/host.js";
export { createApiClient } from "./client/api.js";
export {
  signDeployControl,
  isDeployOwner,
  deployNeedsUserVouch,
} from "./client/host.js";
export type { DeployStatusResponse, DeployAgent } from "./client/host.js";

export { createWalletAdapterFromHooks } from "./wallet-adapter.js";
export {
  createWalletAdapterFromPrivy,
  pickPrivyWallet,
  usePrivyWalletAdapter,
} from "./privy-adapter.js";
export type {
  PrivyConnectedWalletLike,
  PrivyWalletAdapterOptions,
} from "./privy-adapter.js";

export {
  buildFvCallbackUrl,
  parseFvCallback,
  startGoodDollarFaceVerification,
} from "./gooddollar.js";

export {
  GAMEARENA_SKILL_ID,
  ACTIONORDER_SKILL_ID,
  UBI_REMINDER_SKILL_ID,
  BALAIO_WORKER_SKILL_ID,
  DEFAULT_GAMEARENA_CONFIG,
  defaultConfigForSkill,
  defaultDisplayNameForSkill,
  deployTemplateForSkill,
  deployHintForSkill,
  skillShortLabel,
} from "./skill-config.js";

export {
  DEFAULT_REGISTRY_URL,
  fetchSkillRegistry,
  findSkill,
  listDeployableSkills,
} from "./skill-registry.js";
export type { RegistrySkillEntry, SkillRegistry } from "./skill-registry.js";

export {
  createGoodAgentWidgetConfig,
  createGameArenaWidgetConfig,
  resolveWidgetConfig,
  DEFAULT_WIDGET_API,
  DEFAULT_WIDGET_RPC,
  GOODAGENT_API_URL,
  GOODAGENT_HOST_URL,
  GOODAGENT_SITE_ORIGIN,
} from "./defaults.js";

export type {
  GoodAgentWidgetConfig,
  GoodAgentWidgetPartnerConfig,
  GoodAgentWidgetProps,
  GoodAgentWidgetMode,
  GoodAgentWalletAdapter,
  SkillConfiguration,
} from "./types.js";

export {
  AGENT_VAULT_ADDRESS,
  AGENT_ATTESTATION_ADDRESS,
  G_DOLLAR_ADDRESS,
  agentIdDomain,
  buildAgentIdMessage,
  messageToWire,
} from "./constants.js";

import "./styles/widget.css";
