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
} from "./provision.js";
import { fetchSkillsRegistry, findRegistrySkill } from "./registry.js";
import { isSkillDeployable } from "@goodagent/shared";
import {
  buildSkillEnv,
  BALAIO_WORKER_SKILL_ID,
  computeBalaioFundingGs,
  type SkillConfiguration,
  writeSkillEnv,
} from "./skill-env.js";
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
import {
  GAMEARENA_SKILL_ID,
  registerGamePassUsername,
} from "./gamearena-pass.js";

export type PipelineStatus =
  | "provisioning"
  | "installing"
  | "awaiting_vouch"
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
  ownerWallet: Address;
  template?: string;
  skillId: string;
  skillConfiguration?: SkillConfiguration;
  telegramBotToken?: string | null;
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
  gamePassUsername?: string | null;
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
    if (!isSkillDeployable(skill)) {
      throw new Error(`skill_id not available for deploy: ${skillId}`);
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
    if (skillId === GAMEARENA_SKILL_ID) {
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
    const skillConfig = input.skillConfiguration ?? {};
    const gsTarget =
      skillId === BALAIO_WORKER_SKILL_ID
        ? computeBalaioFundingGs(skillConfig, config.agentInitialGs)
        : config.agentInitialGs;
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

    const skillDir = installSkillFromRegistry(config.agentsRoot, deployId, skill);
    const skillEnv = buildSkillEnv(skillId, {
      deployId,
      agentAddress,
      agentPrivateKey:
        skill.spends_tokens ||
        skillId === "gaming/wagering/gamearena_1v1" ||
        skillId === BALAIO_WORKER_SKILL_ID
          ? agentPrivateKey
          : null,
      rpcUrl: config.rpcUrl,
      displayName,
      config: input.skillConfiguration ?? {},
      telegramBotToken: input.telegramBotToken ?? null,
      apiBase: config.apiBase,
    });
    writeSkillEnv(skillDir, skillEnv);

    if (gamePassUsername && skillId === GAMEARENA_SKILL_ID) {
      writeSkillEnv(skillDir, {
        ...skillEnv,
        PLAYER_NAME: gamePassUsername,
        GAME_PASS_USERNAME: gamePassUsername,
      });
    }

    const ecosystemPath = writeEcosystemConfig(config, {
      deployId,
      skillDir,
      env:
        gamePassUsername && skillId === GAMEARENA_SKILL_ID
          ? {
              ...skillEnv,
              PLAYER_NAME: gamePassUsername,
              GAME_PASS_USERNAME: gamePassUsername,
            }
          : skillEnv,
    });

    const verifyUrl = `${config.apiBase}/agent/verify/${agentAddress}`;

    if (input.dryRun) {
      return {
        deployId,
        agentAddress,
        derivationIndex: index,
        pm2Name,
        ecosystemPath,
        skillDir,
        verifyUrl,
        identityIssued: false,
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
      skillDir,
      verifyUrl,
      identityIssued: false,
      gamePassUsername,
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

const PM2_LIST_CACHE_MS = 3_000;
let pm2ListCache: { at: number; list: Pm2ProcessRow[] } | null = null;

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
  try {
    const raw = execSync("pm2 jlist", { encoding: "utf8" });
    const list = JSON.parse(raw) as Pm2ProcessRow[];
    pm2ListCache = { at: now, list };
    return list;
  } catch {
    return pm2ListCache?.list ?? null;
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
