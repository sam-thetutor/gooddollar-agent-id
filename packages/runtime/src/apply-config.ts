import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";
import type { RuntimeConfig } from "./config.js";
import { skillInstallDir } from "./skill-install.js";
import {
  buildSkillEnv,
  writeSkillEnv,
  BALAIO_WORKER_SKILL_ID,
  type SkillConfiguration,
} from "./skill-env.js";
import {
  pm2ProcessName,
  pm2ReloadEcosystem,
  writeEcosystemConfig,
} from "./provision.js";
import { pm2ProcessSnapshot } from "./pipeline.js";
import { deriveAgentPrivateKey, readAgentMeta, writeAgentMeta } from "./wallet.js";
import { GAMEARENA_SKILL_ID } from "./gamearena-pass.js";

export interface DeployAgentRecord {
  id: string;
  displayName: string;
  agentAddress: string | null;
  walletDerivationIndex: number | null;
  configuration: string | null;
  skills: Array<{ skillId: string; registryPath: string }>;
}

function skillFolderFromRegistryPath(registryPath: string): string {
  return registryPath.split("/").pop() ?? registryPath;
}

export function mergeDeployConfiguration(
  existing: string | null | undefined,
  patch: SkillConfiguration,
): SkillConfiguration {
  const base: SkillConfiguration = existing
    ? (JSON.parse(existing) as SkillConfiguration)
    : {};
  const merged = { ...base, ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === "") delete merged[key];
  }
  return merged;
}

function skillNeedsPrivateKey(
  skillId: string,
  _config: SkillConfiguration,
): boolean {
  if (skillId === BALAIO_WORKER_SKILL_ID) return true;
  // Match initial deploy (pipeline.ts): gamearena always gets the agent key so
  // off-chain AUTO_REFILL can pay G$ for ticket top-ups.
  if (skillId === "gaming/wagering/gamearena_1v1") return true;
  return false;
}

/** Rewrite skill .env + PM2 ecosystem from merged configuration; restart if running. */
export function applyDeployConfiguration(
  config: RuntimeConfig,
  agent: DeployAgentRecord,
  patch: SkillConfiguration,
): { merged: SkillConfiguration; restarted: boolean } {
  const primary = agent.skills[0];
  if (!primary) throw new Error("deploy has no skills");

  if (!agent.agentAddress || agent.walletDerivationIndex == null) {
    throw new Error("agent not provisioned");
  }

  const merged = mergeDeployConfiguration(agent.configuration, patch);
  const folder = skillFolderFromRegistryPath(primary.registryPath);
  const skillDir = skillInstallDir(config.agentsRoot, agent.id, folder);
  if (!existsSync(resolve(skillDir, "package.json"))) {
    throw new Error(`skill not installed at ${skillDir}`);
  }

  const agentPrivateKey = skillNeedsPrivateKey(primary.skillId, merged)
    ? deriveAgentPrivateKey(config.deployMnemonic, agent.walletDerivationIndex)
    : null;

  const skillEnv = buildSkillEnv(primary.skillId, {
    deployId: agent.id,
    agentAddress: agent.agentAddress as Address,
    agentPrivateKey,
    rpcUrl: config.rpcUrl,
    displayName: agent.displayName,
    config: merged,
    apiBase: config.apiBase,
  });

  writeSkillEnv(skillDir, skillEnv);
  const ecosystemPath = writeEcosystemConfig(config, {
    deployId: agent.id,
    skillDir,
    env: skillEnv,
  });

  const pm2Name = pm2ProcessName(agent.id);
  const snap = pm2ProcessSnapshot(pm2Name);
  let restarted = false;
  if (snap?.online) {
    pm2ReloadEcosystem(ecosystemPath, pm2Name);
    restarted = true;
  }

  return { merged, restarted };
}

/** After on-chain Pass rename: persist meta, rewrite skill env, reload PM2. */
export function syncAgentAfterPassRename(
  config: RuntimeConfig,
  agent: DeployAgentRecord,
  gamePassUsername: string,
): { restarted: boolean } {
  const primary = agent.skills[0];
  if (!primary) throw new Error("deploy has no skills");
  if (primary.skillId !== GAMEARENA_SKILL_ID) {
    throw new Error("syncAgentAfterPassRename requires a GameArena deploy");
  }

  if (!agent.agentAddress || agent.walletDerivationIndex == null) {
    throw new Error("agent not provisioned");
  }

  try {
    const meta = readAgentMeta(config.agentsRoot, agent.id);
    writeAgentMeta(config.agentsRoot, {
      ...meta,
      displayName: agent.displayName,
      gamePassUsername,
      gamePassRegisteredAt: new Date().toISOString(),
    });
  } catch {
    // meta.json missing on partial deploy — env sync still helps.
  }

  const merged = mergeDeployConfiguration(agent.configuration, {});
  const folder = skillFolderFromRegistryPath(primary.registryPath);
  const skillDir = skillInstallDir(config.agentsRoot, agent.id, folder);
  if (!existsSync(resolve(skillDir, "package.json"))) {
    throw new Error(`skill not installed at ${skillDir}`);
  }

  const agentPrivateKey = deriveAgentPrivateKey(
    config.deployMnemonic,
    agent.walletDerivationIndex,
  );

  const skillEnv = buildSkillEnv(primary.skillId, {
    deployId: agent.id,
    agentAddress: agent.agentAddress as Address,
    agentPrivateKey,
    rpcUrl: config.rpcUrl,
    displayName: agent.displayName,
    config: { ...merged, PLAYER_NAME: gamePassUsername },
    apiBase: config.apiBase,
  });

  const envWithPass = {
    ...skillEnv,
    PLAYER_NAME: gamePassUsername,
    GAME_PASS_USERNAME: gamePassUsername,
  };

  writeSkillEnv(skillDir, envWithPass);
  const ecosystemPath = writeEcosystemConfig(config, {
    deployId: agent.id,
    skillDir,
    env: envWithPass,
  });

  const pm2Name = pm2ProcessName(agent.id);
  const snap = pm2ProcessSnapshot(pm2Name);
  let restarted = false;
  if (snap?.online) {
    pm2ReloadEcosystem(ecosystemPath, pm2Name);
    restarted = true;
  }

  return { restarted };
}
