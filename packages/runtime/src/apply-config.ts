import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";
import {
  buildAgentManifestFromDeploy,
  type SkillInstall,
} from "@goodagent/db";
import type { RuntimeConfig } from "./config.js";
import { writeAgentManifestFile } from "./agent-manifest.js";
import { skillInstallDir } from "./skill-install.js";
import {
  buildSkillEnv,
  writeSkillEnv,
  BALAIO_WORKER_SKILL_ID,
  buildHostReportEnv,
  type SkillConfiguration,
} from "./skill-env.js";
import {
  buildAgentPm2Env,
  buildLegacySkillPm2Env,
} from "./agent-pm2-env.js";
import {
  pm2ProcessName,
  pm2ReloadEcosystem,
  writeEcosystemConfig,
  isRuntimeV1Enabled,
  resolveAgentRuntimeCli,
} from "./provision.js";
import { pm2ProcessSnapshot } from "./pipeline.js";
import { deriveAgentPrivateKey, readAgentMeta, writeAgentMeta } from "./wallet.js";
import { GAMEARENA_SKILL_ID } from "./gamearena-pass.js";
import { ACTIONORDER_SKILL_ID } from "@goodagent/shared";
import { ensureLegacySkillPlugin } from "./legacy-plugin.js";
import { DEFAULT_PLUGIN_ENTRY } from "@goodagent/skill-sdk";
import { agentDir } from "./wallet.js";
import {
  isActionOrderSkillSecure,
  upgradeActionOrderSkillInstall,
} from "./actionorder-skill-upgrade.js";

export interface DeployAgentRecord {
  id: string;
  displayName: string;
  agentAddress: string | null;
  walletDerivationIndex: number | null;
  configuration: string | null;
  skills: Array<{
    skillId: string;
    registryPath: string;
    configJson?: string | null;
    status?: string;
    id?: string;
  }>;
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

function resolveSkillConfig(
  agent: DeployAgentRecord,
  skill: DeployAgentRecord["skills"][number],
): SkillConfiguration {
  if (skill.configJson) {
    try {
      return JSON.parse(skill.configJson) as SkillConfiguration;
    } catch {
      // fall through
    }
  }
  return mergeDeployConfiguration(agent.configuration, {});
}

function skillNeedsPrivateKey(
  skillId: string,
  _config: SkillConfiguration,
): boolean {
  if (skillId === BALAIO_WORKER_SKILL_ID) return true;
  if (skillId === "gaming/wagering/gamearena_1v1") return true;
  if (skillId === "gaming/wagering/playchessify_1v1") return true;
  if (skillId === "gaming/wagering/chess_arena_1v1") return true;
  return false;
}

function toSkillInstallRows(
  agent: DeployAgentRecord,
): SkillInstall[] {
  return agent.skills.map((skill) => ({
    id: skill.id ?? `${agent.id}-${skill.skillId}`,
    deployedAgentId: agent.id,
    skillId: skill.skillId,
    registryPath: skill.registryPath,
    status: skill.status ?? "installed",
    configJson: skill.configJson ?? null,
    lastError: null,
    activatedAt: null,
  }));
}

function regenerateRuntimeManifest(
  config: RuntimeConfig,
  agent: DeployAgentRecord,
  skillConfigs: Record<string, SkillConfiguration>,
): string | null {
  if (!isRuntimeV1Enabled() || !agent.agentAddress) return null;

  const deployDir = agentDir(config.agentsRoot, agent.id);
  const hostReportEnv = buildHostReportEnv(agent.id);
  const skillFolders: Record<string, string> = {};
  const pluginEntries: Record<string, string> = {};
  for (const skill of agent.skills) {
    skillFolders[skill.skillId] = skillFolderFromRegistryPath(skill.registryPath);
    pluginEntries[skill.skillId] = DEFAULT_PLUGIN_ENTRY;
  }

  const rows = toSkillInstallRows(agent).map((row) => ({
    ...row,
    configJson: JSON.stringify(skillConfigs[row.skillId] ?? {}),
  }));

  const manifest = buildAgentManifestFromDeploy({
    agent: {
      id: agent.id,
      displayName: agent.displayName,
      agentAddress: agent.agentAddress,
      configuration: agent.configuration,
    },
    skills: rows,
    rpcUrl: config.rpcUrl,
    apiBase: config.apiBase,
    hostUrl: hostReportEnv.GOODAGENT_HOST_URL ?? "http://127.0.0.1:3002",
    hostSecret: hostReportEnv.HOST_INTERNAL_SECRET,
    skillFolders,
    pluginEntries,
    skillConfigs,
  });

  return writeAgentManifestFile(deployDir, manifest);
}

/** Rewrite skill .env + PM2 ecosystem from merged configuration; restart if running. */
export async function applyDeployConfiguration(
  config: RuntimeConfig,
  agent: DeployAgentRecord,
  patch: SkillConfiguration,
  targetSkillId?: string,
): Promise<{
  merged: SkillConfiguration;
  skillId: string;
  restarted: boolean;
  skillConfigs: Record<string, SkillConfiguration>;
}> {
  const target =
    agent.skills.find((s) => s.skillId === targetSkillId) ?? agent.skills[0];
  if (!target) throw new Error("deploy has no skills");

  if (!agent.agentAddress || agent.walletDerivationIndex == null) {
    throw new Error("agent not provisioned");
  }

  const existingConfig = resolveSkillConfig(agent, target);
  const merged = mergeDeployConfiguration(JSON.stringify(existingConfig), patch);
  const folder = skillFolderFromRegistryPath(target.registryPath);
  let skillDir = skillInstallDir(config.agentsRoot, agent.id, folder);
  if (target.skillId === ACTIONORDER_SKILL_ID) {
    if (!existsSync(resolve(skillDir, "package.json"))) {
      skillDir = await upgradeActionOrderSkillInstall(config, agent.id);
    } else if (!isActionOrderSkillSecure(skillDir)) {
      skillDir = await upgradeActionOrderSkillInstall(config, agent.id);
    }
  } else if (!existsSync(resolve(skillDir, "package.json"))) {
    throw new Error(`skill not installed at ${skillDir}`);
  }

  if (isRuntimeV1Enabled()) {
    ensureLegacySkillPlugin(skillDir, target.skillId);
  }

  const agentPrivateKey = skillNeedsPrivateKey(target.skillId, merged)
    ? deriveAgentPrivateKey(config.deployMnemonic, agent.walletDerivationIndex)
    : null;

  const skillEnv = buildSkillEnv(target.skillId, {
    deployId: agent.id,
    agentAddress: agent.agentAddress as Address,
    agentPrivateKey,
    rpcUrl: config.rpcUrl,
    displayName: agent.displayName,
    config: merged,
    apiBase: config.apiBase,
  });
  writeSkillEnv(skillDir, skillEnv);

  const skillConfigs: Record<string, SkillConfiguration> = {};
  for (const skill of agent.skills) {
    skillConfigs[skill.skillId] =
      skill.skillId === target.skillId
        ? merged
        : resolveSkillConfig(agent, skill);
  }

  target.configJson = JSON.stringify(merged);

  const runtimeV1 = isRuntimeV1Enabled()
    ? {
        manifestPath:
          regenerateRuntimeManifest(config, agent, skillConfigs) ??
          resolve(agentDir(config.agentsRoot, agent.id), "manifest.json"),
        runtimeCli: resolveAgentRuntimeCli(),
      }
    : undefined;

  const pm2Env = isRuntimeV1Enabled()
    ? buildAgentPm2Env(
        config,
        agent.id,
        agent.skills,
        agent.agentAddress as Address,
        agent.walletDerivationIndex,
      )
    : buildLegacySkillPm2Env(agent.id, skillEnv);

  const ecosystemPath = writeEcosystemConfig(config, {
    deployId: agent.id,
    skillDir,
    env: pm2Env,
    runtimeV1,
  });

  const pm2Name = pm2ProcessName(agent.id);
  const snap = pm2ProcessSnapshot(pm2Name);
  let restarted = false;
  if (snap?.online) {
    pm2ReloadEcosystem(ecosystemPath, pm2Name);
    restarted = true;
  }

  return { merged, skillId: target.skillId, restarted, skillConfigs };
}

/** After on-chain Pass rename: persist meta, rewrite skill env, reload PM2. */
export async function syncAgentAfterPassRename(
  config: RuntimeConfig,
  agent: DeployAgentRecord,
  gamePassUsername: string,
): Promise<{ restarted: boolean }> {
  const target = agent.skills.find((s) => s.skillId === GAMEARENA_SKILL_ID);
  if (!target) {
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

  const { restarted } = await applyDeployConfiguration(
    config,
    agent,
    { PLAYER_NAME: gamePassUsername, GAME_PASS_USERNAME: gamePassUsername },
    GAMEARENA_SKILL_ID,
  );
  return { restarted };
}

function collectSkillConfigs(
  agent: DeployAgentRecord,
): Record<string, SkillConfiguration> {
  const skillConfigs: Record<string, SkillConfiguration> = {};
  for (const skill of agent.skills) {
    skillConfigs[skill.skillId] = resolveSkillConfig(agent, skill);
  }
  return skillConfigs;
}

function reloadDeployRuntimeIfRunning(
  config: RuntimeConfig,
  agent: DeployAgentRecord,
  skillConfigs: Record<string, SkillConfiguration>,
  skillDir: string,
): boolean {
  const runtimeV1 = isRuntimeV1Enabled()
    ? {
        manifestPath:
          regenerateRuntimeManifest(config, agent, skillConfigs) ??
          resolve(agentDir(config.agentsRoot, agent.id), "manifest.json"),
        runtimeCli: resolveAgentRuntimeCli(),
      }
    : undefined;

  const pm2Env =
    isRuntimeV1Enabled() && agent.agentAddress && agent.walletDerivationIndex != null
      ? buildAgentPm2Env(
          config,
          agent.id,
          agent.skills,
          agent.agentAddress as Address,
          agent.walletDerivationIndex,
        )
      : buildHostReportEnv(agent.id);

  const ecosystemPath = writeEcosystemConfig(config, {
    deployId: agent.id,
    skillDir,
    env: pm2Env,
    runtimeV1,
  });

  const pm2Name = pm2ProcessName(agent.id);
  const snap = pm2ProcessSnapshot(pm2Name);
  if (snap?.online) {
    pm2ReloadEcosystem(ecosystemPath, pm2Name);
    return true;
  }
  return false;
}

/** Toggle skill enabled flag in manifest + reload PM2 when running. */
export function applySkillInstallStatus(
  config: RuntimeConfig,
  agent: DeployAgentRecord,
  skillId: string,
  enabled: boolean,
): { restarted: boolean; status: string } {
  const target = agent.skills.find((s) => s.skillId === skillId);
  if (!target) throw new Error(`skill not installed: ${skillId}`);

  if (!agent.agentAddress || agent.walletDerivationIndex == null) {
    throw new Error("agent not provisioned");
  }

  const enabledSkills = agent.skills.filter((s) =>
    s.skillId === skillId ? enabled : s.status !== "disabled",
  );
  if (!enabledSkills.length) {
    throw new Error("at least one skill must remain enabled");
  }

  const nextStatus = enabled ? "installed" : "disabled";
  target.status = nextStatus;

  const folder = skillFolderFromRegistryPath(target.registryPath);
  const skillDir = skillInstallDir(config.agentsRoot, agent.id, folder);
  const skillConfigs = collectSkillConfigs(agent);
  const restarted = reloadDeployRuntimeIfRunning(
    config,
    agent,
    skillConfigs,
    skillDir,
  );

  return { restarted, status: nextStatus };
}
