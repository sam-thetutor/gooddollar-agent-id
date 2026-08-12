import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";
import type { LocalAccount } from "viem/accounts";
import type { RuntimeConfig } from "./config.js";
import {
  fundAgentCelo,
  fundAgentGDollar,
  relayAttestation,
} from "./identity.js";
import {
  isPm2Available,
  pm2ProcessName,
  pm2Restart,
  pm2Start,
  pm2Stop,
  writeEcosystemConfig,
  isRuntimeV1Enabled,
  resolveAgentRuntimeCli,
} from "./provision.js";
import { writeAgentManifestFile } from "./agent-manifest.js";
import { buildAgentManifestFromDeploy } from "@goodagent/db";
import { resolvePluginEntry, DEFAULT_PLUGIN_ENTRY } from "@goodagent/skill-sdk";
import { fetchSkillsRegistry, findRegistrySkill } from "./registry.js";
import { isSkillDeployable } from "@goodagent/shared";
import {
  buildSkillEnv,
  BALAIO_WORKER_SKILL_ID,
  computeBalaioFundingGs,
  type SkillConfiguration,
  writeSkillEnv,
  buildHostReportEnv,
} from "./skill-env.js";
import { buildAgentPm2Env, buildLegacySkillPm2Env } from "./agent-pm2-env.js";
import { installSkillFromRegistry } from "./skill-install.js";
import { writeBaselineIfAbsent } from "./baseline-balance.js";
import {
  allocateDerivationIndex,
  deriveAgentAccount,
  deriveAgentPrivateKey,
  writeAgentMeta,
  agentDir,
  readAgentMeta,
} from "./wallet.js";
import { ensureLegacySkillPlugin } from "./legacy-plugin.js";
import {
  brainPm2Name,
  provisionBrain,
  validateTelegramBotToken,
  type BrainDeploySettings,
} from "./brain-provision.js";
import type { SkillInstall } from "@goodagent/db";

export type PipelineStatus =
  | "provisioning"
  | "installing"
  | "awaiting_vouch"
  | "starting"
  | "running"
  | "failed"
  | "paused"
  | "stopped";

import {
  GAMEARENA_SKILL_ID,
  registerGamePassUsername,
} from "./gamearena-pass.js";

export interface PipelineSkillInput {
  skillId: string;
  registryPath: string;
  configuration?: SkillConfiguration;
  installId?: string;
}

export interface DeployPersistHooks {
  onStatus: (
    status: PipelineStatus,
    fields?: {
      agentAddress?: string;
      walletDerivationIndex?: number;
      pm2Name?: string;
      lastError?: string | null;
      deployedAt?: Date;
      operatorWallet?: string;
    },
  ) => Promise<void>;
  onSkillInstalled?: (input: {
    skillId: string;
    configuration: SkillConfiguration;
  }) => Promise<void>;
}

export interface RunPipelineInput {
  deployId: string;
  displayName: string;
  ownerWallet: Address;
  template?: string;
  /** Legacy single-skill input */
  skillId?: string;
  skillConfiguration?: SkillConfiguration;
  /** Multi-skill install list (preferred) */
  skills?: PipelineSkillInput[];
  telegramBotToken?: string | null;
  /** Optional LLM brain companion (persona + Telegram chat). */
  brain?: BrainDeploySettings | null;
  skipIdentity?: boolean;
  dryRun?: boolean;
  resume?: {
    agentAddress: `0x${string}`;
    walletDerivationIndex: number;
  };
  minDerivationIndex?: number;
}

export interface RunPipelineResult {
  deployId: string;
  agentAddress: `0x${string}`;
  derivationIndex: number;
  pm2Name: string;
  ecosystemPath: string;
  /** Primary skill dir (legacy compat) */
  skillDir: string;
  skillDirs: string[];
  verifyUrl?: string;
  identityIssued: boolean;
  gamePassUsername?: string | null;
  /** Telegram bot username of the brain, when a brain was provisioned. */
  brainBotUsername?: string | null;
}

function skillFolderFromRegistryPath(registryPath: string): string {
  return registryPath.split("/").pop() ?? registryPath;
}

function resolvePipelineSkills(
  input: RunPipelineInput,
  registry: Awaited<ReturnType<typeof fetchSkillsRegistry>>,
): PipelineSkillInput[] {
  if (input.skills?.length) return input.skills;
  const skillId = input.skillId;
  if (!skillId) throw new Error("skillId or skills[] is required");
  const entry = findRegistrySkill(registry, skillId);
  if (!entry) throw new Error(`skill_id not in registry: ${skillId}`);
  return [
    {
      skillId,
      registryPath: entry.path,
      configuration: input.skillConfiguration ?? {},
    },
  ];
}

function computeFundingTargetGs(
  skills: PipelineSkillInput[],
  baseGs: number,
): number {
  let target = baseGs;
  for (const skill of skills) {
    const config = skill.configuration ?? {};
    if (skill.skillId === BALAIO_WORKER_SKILL_ID) {
      target = Math.max(target, computeBalaioFundingGs(config, baseGs));
    }
  }
  return target;
}

function skillNeedsAgentPrivateKey(skillId: string, spendsTokens: boolean): boolean {
  return (
    spendsTokens ||
    skillId === GAMEARENA_SKILL_ID ||
    skillId === BALAIO_WORKER_SKILL_ID
  );
}

export async function runDeployPipeline(
  config: RuntimeConfig,
  input: RunPipelineInput,
  hooks: DeployPersistHooks,
): Promise<RunPipelineResult> {
  const { deployId, displayName } = input;
  const template = input.template ?? "gaming";

  try {
    const registry = await fetchSkillsRegistry();
    const pipelineSkills = resolvePipelineSkills(input, registry);
    if (pipelineSkills.length > 1 && !isRuntimeV1Enabled()) {
      throw new Error("multi-skill deploy requires RUNTIME_V1=1");
    }

    const registrySkills = pipelineSkills.map((skillInput) => {
      const entry = findRegistrySkill(registry, skillInput.skillId);
      if (!entry) {
        throw new Error(`skill_id not in registry: ${skillInput.skillId}`);
      }
      if (!isSkillDeployable(entry)) {
        throw new Error(`skill_id not available for deploy: ${skillInput.skillId}`);
      }
      return { skillInput, entry };
    });

    const primarySkillId = pipelineSkills[0]!.skillId;

    await hooks.onStatus("provisioning");

    const index = input.resume
      ? input.resume.walletDerivationIndex
      : allocateDerivationIndex(
          config.agentsRoot,
          (input.minDerivationIndex ?? -1) + 1,
        );
    const account = deriveAgentAccount(config.deployMnemonic, index);
    const agentAddress = (input.resume?.agentAddress ?? account.address) as `0x${string}`;
    const agentPrivateKey = deriveAgentPrivateKey(config.deployMnemonic, index);
    const pm2Name = pm2ProcessName(deployId);

    writeAgentMeta(config.agentsRoot, {
      deployId,
      displayName,
      template,
      address: agentAddress,
      derivationIndex: index,
      createdAt: new Date().toISOString(),
    });

    await hooks.onStatus("provisioning", {
      agentAddress,
      walletDerivationIndex: index,
      pm2Name,
      operatorWallet: input.ownerWallet,
    });

    await fundAgentCelo(config, agentAddress);
    let gamePassUsername: string | null = null;
    if (pipelineSkills.some((s) => s.skillId === GAMEARENA_SKILL_ID)) {
      const pass = await registerGamePassUsername({
        rpcUrl: config.rpcUrl,
        account: account as LocalAccount,
        displayName,
        deployId,
      });
      gamePassUsername = pass.username;
      writeAgentMeta(config.agentsRoot, {
        ...readAgentMeta(config.agentsRoot, deployId),
        gamePassUsername,
        gamePassRegisteredAt: new Date().toISOString(),
      });
    }

    const gsTarget = computeFundingTargetGs(
      pipelineSkills,
      config.agentInitialGs,
    );
    await fundAgentGDollar(config, agentAddress, gsTarget);
    writeBaselineIfAbsent(
      config.agentsRoot,
      deployId,
      config.agentInitialGs,
      "snapshot",
    );

    if (input.skipIdentity) {
      throw new Error(
        "Agent ID verification is required — deploy cannot skip vault bond or attestation",
      );
    }

    await relayAttestation(config, account as LocalAccount);

    await hooks.onStatus("installing", { agentAddress, walletDerivationIndex: index, pm2Name });

    const skillDirs: string[] = [];
    const skillInstallRows: SkillInstall[] = [];
    const skillConfigs: Record<string, SkillConfiguration> = {};
    const skillFolders: Record<string, string> = {};
    const pluginEntries: Record<string, string> = {};

    for (const { skillInput, entry } of registrySkills) {
      const skillConfig = { ...(skillInput.configuration ?? {}) };
      if (
        gamePassUsername &&
        skillInput.skillId === GAMEARENA_SKILL_ID &&
        !skillConfig.PLAYER_NAME
      ) {
        skillConfig.PLAYER_NAME = gamePassUsername;
        skillConfig.GAME_PASS_USERNAME = gamePassUsername;
      }

      const skillDir = installSkillFromRegistry(config.agentsRoot, deployId, entry);
      skillDirs.push(skillDir);

      const pluginEntry = resolvePluginEntry(entry.runtime);
      if (isRuntimeV1Enabled() && !existsSync(resolve(skillDir, pluginEntry))) {
        ensureLegacySkillPlugin(skillDir, skillInput.skillId);
      }

      const skillEnv = buildSkillEnv(skillInput.skillId, {
        deployId,
        agentAddress,
        agentPrivateKey: skillNeedsAgentPrivateKey(
          skillInput.skillId,
          entry.spends_tokens,
        )
          ? agentPrivateKey
          : null,
        rpcUrl: config.rpcUrl,
        displayName,
        config: skillConfig,
        telegramBotToken: input.telegramBotToken ?? null,
        apiBase: config.apiBase,
      });
      writeSkillEnv(skillDir, skillEnv);

      skillConfigs[skillInput.skillId] = skillConfig;
      skillFolders[skillInput.skillId] = skillFolderFromRegistryPath(
        skillInput.registryPath,
      );
      pluginEntries[skillInput.skillId] = isRuntimeV1Enabled()
        ? DEFAULT_PLUGIN_ENTRY
        : pluginEntry;

      skillInstallRows.push({
        id: skillInput.installId ?? `${deployId}-${skillInput.skillId}`,
        deployedAgentId: deployId,
        skillId: skillInput.skillId,
        registryPath: skillInput.registryPath,
        status: "installed",
        configJson: JSON.stringify(skillConfig),
        lastError: null,
        activatedAt: new Date(),
      });

      await hooks.onSkillInstalled?.({
        skillId: skillInput.skillId,
        configuration: skillConfig,
      });
    }

    const primarySkillDir = skillDirs[0]!;
    const deployDir = agentDir(config.agentsRoot, deployId);
    const hostReportEnv = buildHostReportEnv(deployId);
    const primaryConfig = skillConfigs[primarySkillId] ?? {};

    let runtimeV1:
      | { manifestPath: string; runtimeCli: string }
      | undefined;
    if (isRuntimeV1Enabled()) {
      const hostUrl = hostReportEnv.GOODAGENT_HOST_URL ?? "http://127.0.0.1:3002";
      const manifest = buildAgentManifestFromDeploy({
        agent: {
          id: deployId,
          displayName,
          agentAddress,
          configuration: JSON.stringify(primaryConfig),
        },
        skills: skillInstallRows,
        rpcUrl: config.rpcUrl,
        apiBase: config.apiBase,
        hostUrl,
        hostSecret: hostReportEnv.HOST_INTERNAL_SECRET,
        skillFolders,
        pluginEntries,
        skillConfigs,
      });
      const manifestPath = writeAgentManifestFile(deployDir, manifest);
      runtimeV1 = {
        manifestPath,
        runtimeCli: resolveAgentRuntimeCli(),
      };
    }

    const primaryEnv = buildSkillEnv(primarySkillId, {
      deployId,
      agentAddress,
      agentPrivateKey: skillNeedsAgentPrivateKey(
        primarySkillId,
        registrySkills[0]!.entry.spends_tokens,
      )
        ? agentPrivateKey
        : null,
      rpcUrl: config.rpcUrl,
      displayName,
      config: primaryConfig,
      telegramBotToken: input.telegramBotToken ?? null,
      apiBase: config.apiBase,
    });

    const pm2Env = isRuntimeV1Enabled()
      ? buildAgentPm2Env(
          config,
          deployId,
          skillInstallRows,
          agentAddress,
          index,
        )
      : buildLegacySkillPm2Env(deployId, primaryEnv);

    // Optional LLM brain companion (chat persona over Telegram).
    let brainApp: ReturnType<typeof provisionBrain> | undefined;
    let brainBotUsername: string | null = null;
    if (input.brain?.botToken) {
      brainBotUsername = await validateTelegramBotToken(input.brain.botToken);
      brainApp = provisionBrain({
        deployId,
        displayName,
        template,
        agentAddress,
        agentsRoot: config.agentsRoot,
        apiBase: config.apiBase,
        hostUrl: hostReportEnv.GOODAGENT_HOST_URL ?? "http://127.0.0.1:3010",
        skills: pipelineSkills.map((s) => ({
          skillId: s.skillId,
          configuration: skillConfigs[s.skillId],
        })),
        settings: input.brain,
      });
    }

    const ecosystemPath = writeEcosystemConfig(config, {
      deployId,
      skillDir: primarySkillDir,
      env: pm2Env,
      runtimeV1,
      brain: brainApp,
    });

    const verifyUrl = `${config.apiBase}/agent/verify/${agentAddress}`;

    if (input.dryRun) {
      return {
        deployId,
        agentAddress,
        derivationIndex: index,
        pm2Name,
        ecosystemPath,
        skillDir: primarySkillDir,
        skillDirs,
        verifyUrl,
        identityIssued: false,
        brainBotUsername,
      };
    }

    await hooks.onStatus("awaiting_vouch", {
      agentAddress,
      walletDerivationIndex: index,
      pm2Name,
      lastError: null,
    });

    return {
      deployId,
      agentAddress,
      derivationIndex: index,
      pm2Name,
      ecosystemPath,
      skillDir: primarySkillDir,
      skillDirs,
      verifyUrl,
      identityIssued: false,
      gamePassUsername,
      brainBotUsername,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await hooks.onStatus("failed", { lastError: message });
    throw err;
  }
}

/** @deprecated Use runDeployPipeline */
export const runClaimBotPipeline = runDeployPipeline;

export function stopDeployedAgent(deployId: string): void {
  try {
    pm2Stop(pm2ProcessName(deployId));
  } catch {
    // Process may already be stopped or never started.
  }
  if (pm2ProcessSnapshot(brainPm2Name(deployId))) {
    try {
      pm2Stop(brainPm2Name(deployId));
    } catch {
      // Brain may already be stopped.
    }
  }
}

/** Start or restart PM2 for a deploy; cold-starts from ecosystem when needed. */
export function startDeployedAgent(
  config: RuntimeConfig,
  deployId: string,
): "started" | "restarted" {
  const name = pm2ProcessName(deployId);
  const ecoPath = resolve(
    agentDir(config.agentsRoot, deployId),
    "ecosystem.config.cjs",
  );

  if (!isPm2Available()) {
    throw new Error("pm2 not found in PATH");
  }

  const startOrRestart = (procName: string, snap: Pm2ProcessSnapshot): void => {
    if (snap.online) {
      pm2Restart(procName);
      return;
    }
    execSync(`pm2 start ${JSON.stringify(procName)}`, {
      stdio: "inherit",
      encoding: "utf8",
    });
  };

  const snap = pm2ProcessSnapshot(name);
  if (snap) {
    startOrRestart(name, snap);
    const brainSnap = pm2ProcessSnapshot(brainPm2Name(deployId));
    if (brainSnap) startOrRestart(brainPm2Name(deployId), brainSnap);
    return snap.online ? "restarted" : "started";
  }

  if (existsSync(ecoPath)) {
    // Ecosystem may include the brain companion app — starts both.
    pm2Start(ecoPath);
    return "started";
  }

  const err = new Error(
    "Agent files are missing on this host. Re-provision from the dashboard.",
  );
  (err as { code?: string }).code = "AGENT_NOT_PROVISIONED";
  throw err;
}

export function restartDeployedAgent(
  config: RuntimeConfig,
  deployId: string,
): void {
  startDeployedAgent(config, deployId);
}

export interface Pm2ProcessSnapshot {
  name: string;
  status: string;
  online: boolean;
  memoryMb?: number;
  cpu?: number;
  uptimeMs?: number;
  restarts?: number;
}

const PM2_LIST_CACHE_MS = 30_000;
let pm2ListCache: { at: number; list: Pm2ProcessRow[] } | null = null;
let pm2ListRefreshing = false;

type Pm2ProcessRow = {
  name: string;
  pm2_env?: {
    status?: string;
    restart_time?: number;
    pm_uptime?: number;
  };
  monit?: { memory?: number; cpu?: number };
};

function readPm2ProcessList(): Pm2ProcessRow[] | null {
  const now = Date.now();
  if (pm2ListCache && now - pm2ListCache.at < PM2_LIST_CACHE_MS) {
    return pm2ListCache.list;
  }
  // Stale-while-revalidate: execSync pm2 jlist can take 1–5s on a loaded VPS.
  // Return the previous list while another request refreshes to avoid stampedes.
  if (pm2ListRefreshing && pm2ListCache) {
    return pm2ListCache.list;
  }
  pm2ListRefreshing = true;
  try {
    const raw = execSync("pm2 jlist", { encoding: "utf8" });
    const list = JSON.parse(raw) as Pm2ProcessRow[];
    pm2ListCache = { at: now, list };
    return list;
  } catch {
    return pm2ListCache?.list ?? null;
  } finally {
    pm2ListRefreshing = false;
  }
}

export function pm2ProcessSnapshot(processName: string): Pm2ProcessSnapshot | null {
  try {
    const list = readPm2ProcessList();
    if (!list) return null;
    const proc = list.find((p) => p.name === processName);
    if (!proc) return null;
    const env = proc.pm2_env ?? {};
    const status = env.status ?? "unknown";
    return {
      name: processName,
      status,
      online: status === "online",
      memoryMb: proc.monit?.memory
        ? Math.round(proc.monit.memory / 1024 / 1024)
        : undefined,
      cpu: proc.monit?.cpu,
      uptimeMs: env.pm_uptime ? Date.now() - env.pm_uptime : undefined,
      restarts: env.restart_time,
    };
  } catch {
    return null;
  }
}
