import type { Address } from "viem";
import type { RuntimeConfig } from "./config.js";
import {
  issueAgentCredentialForOperatorKey,
} from "./identity.js";
import {
  runDeployPipeline,
  startDeployedAgent,
  type DeployPersistHooks,
  type PipelineSkillInput,
} from "./pipeline.js";
import {
  accountFromImportedPrivateKey,
  IMPORTED_WALLET_DERIVATION_INDEX,
  normalizeAgentPrivateKey,
} from "./wallet.js";
import { GAMEARENA_SKILL_ID } from "./gamearena-pass.js";

export interface ImportWalletDeployInput {
  deployId: string;
  displayName: string;
  importedPrivateKey: string;
  skills?: PipelineSkillInput[];
  /** Defaults to the imported wallet address (self-owned agent). */
  ownerWallet?: Address;
  template?: string;
}

export interface ImportWalletDeployResult {
  deployId: string;
  agentAddress: Address;
  ownerWallet: Address;
  verified: boolean;
  started: boolean;
}

const DEFAULT_GAMEARENA_CONFIG: Record<string, string> = {
  PLAY_MODE: "offchain",
  MARKOV_STRATEGY: "random",
  RPS_SEQUENCE: "rock,paper,scissors",
  RPS_FIXED: "rock",
  DAILY_MATCH_CAP: "50",
  AUTO_REFILL: "1",
  DAILY_REFILL_CAP_GS: "20",
  MAX_REFILLS_PER_DAY: "10",
  WAGER_GS: "1",
  DAILY_LOSS_CAP_GS: "20",
  ACCEPT_TIMEOUT_SECONDS: "90",
  GAME_TYPE: "0",
  MAX_MATCHES: "10",
  MATCH_INTERVAL_SECONDS: "300",
};
const DEFAULT_GAMEARENA_SKILLS: PipelineSkillInput[] = [
  {
    skillId: GAMEARENA_SKILL_ID,
    registryPath: "skills/gamearena-player",
    configuration: DEFAULT_GAMEARENA_CONFIG,
  },
];

export async function importWalletDeploy(
  config: RuntimeConfig,
  input: ImportWalletDeployInput,
  hooks: DeployPersistHooks,
): Promise<ImportWalletDeployResult> {
  const account = accountFromImportedPrivateKey(input.importedPrivateKey);
  const agentAddress = account.address;
  const ownerWallet = (input.ownerWallet ?? agentAddress) as Address;
  const operatorKey = normalizeAgentPrivateKey(input.importedPrivateKey);

  await runDeployPipeline(
    config,
    {
      deployId: input.deployId,
      displayName: input.displayName.trim(),
      ownerWallet,
      template: input.template ?? "gaming",
      skills: input.skills?.length ? input.skills : DEFAULT_GAMEARENA_SKILLS,
      importedPrivateKey: input.importedPrivateKey,
    },
    hooks,
  );

  const issue = await issueAgentCredentialForOperatorKey(
    config,
    agentAddress,
    operatorKey,
    { required: true },
  );

  let started = false;
  try {
    startDeployedAgent(config, input.deployId);
    started = true;
  } catch (err) {
    console.warn(
      `[import-wallet] pm2 start failed for ${input.deployId}: ${(err as Error).message}`,
    );
  }

  return {
    deployId: input.deployId,
    agentAddress,
    ownerWallet,
    verified: issue.issued,
    started,
  };
}

export { IMPORTED_WALLET_DERIVATION_INDEX };
