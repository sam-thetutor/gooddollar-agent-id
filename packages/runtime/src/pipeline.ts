import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import type { LocalAccount } from "viem/accounts";
import type { RuntimeConfig } from "./config.js";
import { fundAgentCelo, fundAgentGDollar, issueAgentCredential, relayAttestation, assertAgentPlayReady } from "./identity.js";
import {
  isPm2Available,
  pm2ProcessName,
  pm2Restart,
  pm2Start,
  pm2Stop,
  writeEcosystemConfig,
} from "./provision.js";
import { fetchSkillsRegistry, findRegistrySkill } from "./registry.js";
import { buildSkillEnv, type SkillConfiguration, writeSkillEnv } from "./skill-env.js";
import { installSkillFromRegistry } from "./skill-install.js";
import { fetchAgentBalances } from "./deploy-stats.js";
import { writeBaselineIfAbsent } from "./baseline-balance.js";
import {
  allocateDerivationIndex,
  deriveAgentAccount,
  deriveAgentPrivateKey,
  writeAgentMeta,
  agentDir,
} from "./wallet.js";

export type PipelineStatus =
  | "provisioning"
  | "installing"
  | "starting"
  | "running"
  | "failed"
  | "paused"
  | "stopped";

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
}

export interface RunPipelineInput {
  deployId: string;
  displayName: string;
  template?: string;
  skillId: string;
  skillConfiguration?: SkillConfiguration;
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
  skillDir: string;
  verifyUrl?: string;
  identityIssued: boolean;
}

export async function runDeployPipeline(
  config: RuntimeConfig,
  input: RunPipelineInput,
  hooks: DeployPersistHooks,
): Promise<RunPipelineResult> {
  const { deployId, displayName, skillId } = input;
  const template = input.template ?? "gaming";

  try {
    const registry = await fetchSkillsRegistry();
    const skill = findRegistrySkill(registry, skillId);
    if (!skill) {
      throw new Error(`skill_id not in registry: ${skillId}`);
    }

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
    const operatorWallet = config.operatorPrivateKey
      ? privateKeyToAccount(config.operatorPrivateKey).address
      : undefined;

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
      operatorWallet,
    });

    await fundAgentCelo(config, agentAddress);
    await fundAgentGDollar(config, agentAddress);
    writeBaselineIfAbsent(
      config.agentsRoot,
      deployId,
      config.agentInitialGs,
      "snapshot",
    );

    let identityIssued = false;
    let verifyUrl: string | undefined;

    if (input.skipIdentity) {
      throw new Error(
        "Agent ID verification is required — deploy cannot skip vault bond or attestation",
      );
    }

    await relayAttestation(config, account as LocalAccount);
    const issue = await issueAgentCredential(config, agentAddress, { required: true });
    identityIssued = issue.issued;
    verifyUrl = issue.verifyUrl;

    if (!identityIssued) {
      throw new Error("GoodAgent ID issuance failed — agent cannot play without verification");
    }

    await assertAgentPlayReady(config, agentAddress);

    await hooks.onStatus("installing", { agentAddress, walletDerivationIndex: index, pm2Name });

    const skillDir = installSkillFromRegistry(config.agentsRoot, deployId, skill);
    const skillEnv = buildSkillEnv(skillId, {
      agentAddress,
      agentPrivateKey: skill.spends_tokens ? agentPrivateKey : null,
      rpcUrl: config.rpcUrl,
      displayName,
      config: input.skillConfiguration ?? {},
    });
    writeSkillEnv(skillDir, skillEnv);

    const ecosystemPath = writeEcosystemConfig(config, {
      deployId,
      skillDir,
      env: skillEnv,
    });

    if (input.dryRun) {
      return {
        deployId,
        agentAddress,
        derivationIndex: index,
        pm2Name,
        ecosystemPath,
        skillDir,
        verifyUrl,
        identityIssued,
      };
    }

    await hooks.onStatus("starting", { agentAddress, walletDerivationIndex: index, pm2Name });

    if (!isPm2Available()) {
      throw new Error("pm2 not found in PATH");
    }
    pm2Start(ecosystemPath);

    await hooks.onStatus("running", {
      agentAddress,
      walletDerivationIndex: index,
      pm2Name,
      deployedAt: new Date(),
      lastError: null,
    });

    if (agentAddress) {
      try {
        const bal = await fetchAgentBalances(agentAddress, config.rpcUrl);
        const gs = Number(bal.gDollarFormatted);
        if (Number.isFinite(gs) && gs >= 1) {
          writeBaselineIfAbsent(config.agentsRoot, deployId, gs, "snapshot");
        }
      } catch {
        // Baseline was set after platform funding.
      }
    }

    return {
      deployId,
      agentAddress,
      derivationIndex: index,
      pm2Name,
      ecosystemPath,
      skillDir,
      verifyUrl,
      identityIssued,
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

  const snap = pm2ProcessSnapshot(name);
  if (snap) {
    if (snap.online) {
      pm2Restart(name);
      return "restarted";
    }
    execSync(`pm2 start ${JSON.stringify(name)}`, {
      stdio: "inherit",
      encoding: "utf8",
    });
    return "started";
  }

  if (existsSync(ecoPath)) {
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

export function pm2ProcessSnapshot(processName: string): Pm2ProcessSnapshot | null {
  try {
    const raw = execSync("pm2 jlist", { encoding: "utf8" });
    const list = JSON.parse(raw) as Array<{
      name: string;
      pm2_env?: {
        status?: string;
        restart_time?: number;
        pm_uptime?: number;
      };
      monit?: { memory?: number; cpu?: number };
    }>;
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
