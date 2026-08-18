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
  fundAgentUsdtFromGs,
  fundAgentUsdtFromGsByKey,
  quoteAgentUsdtFunding,
} from "./agent-usdt-funding.js";
export type { FundAgentUsdtResult } from "./agent-usdt-funding.js";

export {
  writeEcosystemConfig,
  pm2Start,
  pm2Stop,
  pm2Restart,
  pm2Delete,
  pm2Status,
  pm2ProcessName,
  isPm2Available,
  isRuntimeV1Enabled,
  resolveAgentRuntimeCli,
} from "./provision.js";
export type { SkillProvisionInput } from "./provision.js";

export {
  brainPm2Name,
  buildBrainPersona,
  provisionBrain,
  resolveAgentBrainCli,
  validateTelegramBotToken,
  DEFAULT_BRAIN_TOOLS,
} from "./brain-provision.js";
export type {
  BrainDeploySettings,
  BrainProvisionInput,
  BrainProvisionResult,
} from "./brain-provision.js";

export { writeAgentManifestFile } from "./agent-manifest.js";
export { ensureLegacySkillPlugin, skillHasNativePlugin } from "./legacy-plugin.js";

export {
  fetchSkillsRegistry,
  findRegistrySkill,
  searchRegistrySkills,
  fetchSkillMarkdown,
  fetchSkillEnvExample,
  SKILLS_REGISTRY_URL,
  SKILLS_REPO_URL,
  SKILLS_REPO_RAW_BASE,
} from "./registry.js";
export type { RegistrySkill, SkillsRegistry } from "./registry.js";
export {
  isSkillDeployable,
  isSkillListed,
  filterListedSkills,
} from "@goodagent/shared";

export {
  installSkillFromRegistry,
  skillInstallDir,
  skillsCacheDir,
} from "./skill-install.js";

export {
  installSkillLocally,
  ensureSkillsRepoCache,
  defaultSkillsCacheDir,
  defaultLocalInstallDir,
  readInstalledEnvExample,
} from "./skill-local-install.js";
export type { LocalInstallResult, InstallSkillLocallyOptions } from "./skill-local-install.js";

export { parseSkillFrontmatter } from "./skill-frontmatter.js";
export type { SkillFrontmatter } from "./skill-frontmatter.js";

export {
  buildInstallManifest,
  requiredEnvFromSkillMd,
  skillApiUrl,
  DEFAULT_PLUGIN_ENTRY,
} from "./skill-manifest.js";
export type { SkillInstallManifest } from "./skill-manifest.js";

export {
  buildSkillEnv,
  buildGamearenaEnv,
  buildActionorderEnv,
  buildProofOfAlphaHuntEnv,
  PROOF_OF_ALPHA_HUNT_SKILL_ID,
  buildUbiReminderEnv,
  buildBalaioEnv,
  buildPlaychessifyEnv,
  buildChessArenaEnv,
  CHESS_ARENA_SKILL_ID,
  CHESS_ARENA_MIN_FUNDING_GS,
  computeChessArenaFundingGs,
  resolveGamearenaAgentApiEnv,
  UBI_REMINDER_SKILL_ID,
  BALAIO_WORKER_SKILL_ID,
  PLAYCHESSIFY_SKILL_ID,
  PRODUCTCLANK_SKILL_ID,
  buildProductClankEnv,
  writeSkillEnv,
} from "./skill-env.js";
export type { SkillConfiguration } from "./skill-env.js";

export {
  ensureErc8004AgentId,
  registerWithProductClank,
  createProductClankLink,
} from "./productclank-provision.js";
export type {
  ProductClankRegistration,
  ProductClankLink,
} from "./productclank-provision.js";

export {
  applyDeployConfiguration,
  applySkillInstallStatus,
  mergeDeployConfiguration,
  syncAgentAfterPassRename,
} from "./apply-config.js";
export type { DeployAgentRecord } from "./apply-config.js";

export {
  runDeployPipeline,
  runClaimBotPipeline,
  stopDeployedAgent,
  startDeployedAgent,
  stopDeployedAgentWorkers,
  startDeployedAgentWorkers,
  restartDeployedAgent,
  pm2ProcessSnapshot,
} from "./pipeline.js";
export type {
  PipelineStatus,
  DeployPersistHooks,
  RunPipelineInput,
  RunPipelineResult,
  Pm2ProcessSnapshot,
  PipelineSkillInput,
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
} from "./deploy-stats.js";

export {
  collectSkillStats,
  collectDeploySkillStats,
  resolveSkillStatsAdapter,
} from "./skill-stats/index.js";
export type {
  SkillStatsSummary,
  SkillStatsContext,
  SkillStatsAdapter,
} from "./skill-stats/index.js";
export type {
  GamearenaLadder,
  EnrichedGamearenaLadder,
  GoodAgentLadderMeta,
  EnrichedLadderEntry,
} from "./gamearena-leaderboard.js";
export { fetchGamearenaLadder } from "./gamearena-ladder.js";
export type { LadderTopEntry } from "./gamearena-ladder.js";

export {
  GAME_PASS_ADDRESS,
  GAMEARENA_CHALLENGE_AI_GAME_TYPE,
  GAMEARENA_SKILL_ID,
  sanitizeGamePassUsername,
  resolvePassUsernameFromDisplayName,
  readGamePassProfile,
  checkGamePassUsernameForAgent,
  setGamePassUsername,
  registerGamePassUsername,
} from "./gamearena-pass.js";
export type {
  GamePassProfile,
  RegisterGamePassResult,
  GamePassUsernameCheck,
} from "./gamearena-pass.js";

export {
  buildGoodAgentRegistry,
  enrichGamearenaLadder,
  enrichLadderEntry,
  fetchEnrichedGamearenaLadder,
  buildGamearenaRegistryFromAgents,
} from "./gamearena-leaderboard.js";

export {
  readBaseline,
  writeBaseline,
  writeBaselineIfAbsent,
  resolveBaseline,
} from "./baseline-balance.js";
export type { BaselineRecord, BaselineSource } from "./baseline-balance.js";

export { deployClaimBotSpike } from "./deploy-claim-bot.js";
export type { DeploySpikeOptions, DeploySpikeResult } from "./deploy-claim-bot.js";

export {
  playGamearenaMatchOnce,
} from "./gamearena-play-once.js";
export type { PlayGamearenaMatchOnceResult } from "./gamearena-play-once.js";

export {
  playChessArenaMatchOnce,
} from "./chess-arena-play-once.js";
export type { PlayChessArenaMatchOnceResult } from "./chess-arena-play-once.js";

export {
  playActionOrderMatchOnce,
  actionorderSkillDir,
} from "./actionorder-play-once.js";
export type { PlayActionOrderMatchOnceResult } from "./actionorder-play-once.js";

export {
  isActionOrderSkillSecure,
  upgradeActionOrderSkillInstall,
  patchAllActionOrderSecureSkills,
} from "./actionorder-skill-upgrade.js";
export type { PatchActionOrderSecureSkillsResult } from "./actionorder-skill-upgrade.js";

export {
  gamearenaAgentApiStart,
  gamearenaAgentApiThrow,
  isGamearenaAgentApiConfigured,
} from "./gamearena-agent-api.js";
export type {
  GamearenaStartMatchResult,
  GamearenaThrowMoveResult,
} from "./gamearena-agent-api.js";

export {
  gamearenaPlayFast,
  spawnThrowWorkerDetached,
} from "./gamearena-play-fast.js";
export type { GamearenaPlayFastResult } from "./gamearena-play-fast.js";

export {
  GAMEARENA_DAILY_CAP_EXIT_CODE,
  detectDailyCapFromLog,
  gamearenaSkillDir,
  isGamearenaDailyCapReached,
  isGamearenaSkillDir,
  readDailyMatchCap,
  readGamearenaDailyCapState,
  utcDayString,
  writeGamearenaPm2StartGuard,
} from "./gamearena-daily-cap.js";

export {
  pauseGamearenaAgentAtDailyCap,
  patchAllGamearenaDailyCapGuards,
} from "./gamearena-daily-cap-enforce.js";
export type {
  PauseGamearenaDailyCapResult,
  PatchGamearenaDailyCapGuardsResult,
} from "./gamearena-daily-cap-enforce.js";
