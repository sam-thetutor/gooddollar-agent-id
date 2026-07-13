export { loadRuntimeEnv, getRuntimeConfig, getMonorepoRoot } from "./config.js";
export type { RuntimeConfig } from "./config.js";

export {
  allocateDerivationIndex,
  deriveAgentAccount,
  deriveAgentPrivateKey,
  writeAgentMeta,
  readAgentMeta,
  agentDir,
} from "./wallet.js";
export type { AgentWalletMeta } from "./wallet.js";

export {
  fundAgentCelo,
  fundAgentGDollar,
  relayAttestation,
  issueAgentCredential,
  assertAgentPlayReady,
  assertOwnerVouchedForAgent,
} from "./identity.js";
export type { IssueResult } from "./identity.js";

export {
  writeEcosystemConfig,
  pm2Start,
  pm2Stop,
  pm2Restart,
  pm2Delete,
  pm2Status,
  pm2ProcessName,
  isPm2Available,
} from "./provision.js";
export type { SkillProvisionInput } from "./provision.js";

export {
  fetchSkillsRegistry,
  findRegistrySkill,
  SKILLS_REGISTRY_URL,
  SKILLS_REPO_URL,
} from "./registry.js";
export type { RegistrySkill, SkillsRegistry } from "./registry.js";

export {
  installSkillFromRegistry,
  skillInstallDir,
  skillsCacheDir,
} from "./skill-install.js";

export {
  buildSkillEnv,
  buildGamearenaEnv,
  buildActionorderEnv,
  writeSkillEnv,
} from "./skill-env.js";
export type { SkillConfiguration } from "./skill-env.js";

export {
  runDeployPipeline,
  runClaimBotPipeline,
  stopDeployedAgent,
  startDeployedAgent,
  restartDeployedAgent,
  pm2ProcessSnapshot,
} from "./pipeline.js";
export type {
  PipelineStatus,
  DeployPersistHooks,
  RunPipelineInput,
  RunPipelineResult,
  Pm2ProcessSnapshot,
} from "./pipeline.js";

export {
  getDeployStats,
  fetchAgentBalances,
  readGamearenaStats,
  setDeployBaselineBalance,
} from "./deploy-stats.js";
export type {
  DeployStats,
  AgentBalances,
  GamePerformance,
  WalletPnL,
  MatchRecord,
  GamearenaLadder,
} from "./deploy-stats.js";

export {
  readBaseline,
  writeBaseline,
  writeBaselineIfAbsent,
  resolveBaseline,
} from "./baseline-balance.js";
export type { BaselineRecord, BaselineSource } from "./baseline-balance.js";

export { deployClaimBotSpike } from "./deploy-claim-bot.js";
export type { DeploySpikeOptions, DeploySpikeResult } from "./deploy-claim-bot.js";
