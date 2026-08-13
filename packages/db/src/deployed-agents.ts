import type { DeployedAgent, SkillInstall } from "@prisma/client";
import { assertDeploySkillCount } from "@goodagent/shared";
import { prisma } from "./client.js";

export type DeployStatus =
  | "pending_payment"
  | "provisioning"
  | "installing"
  | "awaiting_vouch"
  | "starting"
  | "running"
  | "paused"
  | "failed"
  | "stopped";

export interface DeploySkillInput {
  skillId: string;
  registryPath: string;
  configuration?: Record<string, string>;
}

/**
 * Persisted brain settings for a deploy (JSON in `brainConfig`).
 * The bot token is stored separately, encrypted (`brainBotTokenEnc`).
 */
export interface DeployBrainConfig {
  enabled: boolean;
  /** Inference model, e.g. "deepseek-v4-flash" or "<peerId>@<model>". */
  model?: string;
  /** Persona preset name; defaults to the deploy template. */
  personaPreset?: string;
  /** Brain tool names; defaults applied by the pipeline. */
  tools?: string[];
  /** Telegram bot username, filled in after the pipeline validates the token. */
  botUsername?: string;
  /** Telegram user id of the linked operator (may control the agent from chat). */
  operatorTelegramId?: number;
  /** Telegram username of the linked operator, for display only. */
  operatorTelegramUsername?: string | null;
}

export interface CreateDeployedAgentInput {
  displayName: string;
  template?: string;
  ownerWallet?: string | null;
  skills?: DeploySkillInput[];
  /** Legacy flat config — applied to primary skill when per-skill config absent */
  configuration?: Record<string, string> | null;
  /** Per-skill config keyed by skillId (preferred) */
  skillConfigurations?: Record<string, Record<string, string>> | null;
  telegramBotToken?: string | null;
  brain?: (Omit<DeployBrainConfig, "botUsername"> & { botToken?: string | null }) | null;
  encryptionSecret?: string | null;
}

const DEFAULT_GAMING_SKILL: DeploySkillInput = {
  skillId: "gaming/wagering/gamearena_1v1",
  registryPath: "skills/gamearena-player",
};

export async function createDeployedAgent(
  input: CreateDeployedAgentInput,
): Promise<DeployedAgent & { skills: SkillInstall[] }> {
  const template = input.template ?? "gaming";
  const skills =
    input.skills?.length
      ? input.skills
      : template === "gaming"
        ? [DEFAULT_GAMING_SKILL]
        : [];

  if (!skills.length) {
    throw new Error("at least one skill is required");
  }

  assertDeploySkillCount(skills.map((s) => s.skillId));

  let telegramBotTokenEnc: string | null = null;
  if (input.telegramBotToken && input.encryptionSecret) {
    const { encryptSecret } = await import("./crypto.js");
    telegramBotTokenEnc = encryptSecret(
      input.telegramBotToken,
      input.encryptionSecret,
    );
  }

  let brainConfig: string | null = null;
  let brainBotTokenEnc: string | null = null;
  if (input.brain?.enabled) {
    const { botToken, ...rest } = input.brain;
    brainConfig = JSON.stringify(rest);
    if (botToken && input.encryptionSecret) {
      const { encryptSecret } = await import("./crypto.js");
      brainBotTokenEnc = encryptSecret(botToken, input.encryptionSecret);
    }
  }

  const configuration =
    input.configuration && Object.keys(input.configuration).length
      ? JSON.stringify(input.configuration)
      : null;

  const skillConfigurations = input.skillConfigurations ?? {};

  return prisma.deployedAgent.create({
    data: {
      displayName: input.displayName,
      template,
      ownerWallet: input.ownerWallet?.toLowerCase() ?? null,
      status: "pending_payment",
      configuration,
      telegramBotTokenEnc,
      brainConfig,
      brainBotTokenEnc,
      skills: {
        create: skills.map((s, index) => {
          const perSkill =
            skillConfigurations[s.skillId] ??
            s.configuration ??
            (index === 0 && input.configuration ? input.configuration : null);
          const configJson =
            perSkill && Object.keys(perSkill).length
              ? JSON.stringify(perSkill)
              : null;
          return {
            skillId: s.skillId,
            registryPath: s.registryPath,
            status: "pending",
            configJson,
          };
        }),
      },
    },
    include: { skills: true },
  });
}

export function getDeployedAgent(
  id: string,
): Promise<(DeployedAgent & { skills: SkillInstall[] }) | null> {
  return prisma.deployedAgent.findUnique({
    where: { id },
    include: { skills: true },
  });
}

export function listDeployedAgentsByOwner(
  ownerWallet: string,
): Promise<(DeployedAgent & { skills: SkillInstall[] })[]> {
  return prisma.deployedAgent.findMany({
    where: { ownerWallet: ownerWallet.toLowerCase() },
    orderBy: { createdAt: "desc" },
    include: { skills: true },
  });
}

export function updateDeployedAgent(
  id: string,
  data: Partial<{
    status: DeployStatus;
    agentAddress: string;
    walletDerivationIndex: number;
    operatorWallet: string;
    pm2Name: string;
    lastError: string | null;
    lastHeartbeatAt: Date;
    deployedAt: Date;
    deployPaymentTx: string;
    configuration: string;
    telegramBotTokenEnc: string;
    brainConfig: string | null;
    brainBotTokenEnc: string | null;
    displayName: string;
  }>,
): Promise<DeployedAgent> {
  return prisma.deployedAgent.update({ where: { id }, data });
}

export function recordHeartbeat(
  id: string,
  at: Date = new Date(),
): Promise<DeployedAgent> {
  return prisma.deployedAgent.update({
    where: { id },
    data: { lastHeartbeatAt: at },
  });
}

export function confirmDeployPayment(
  deployId: string,
  txHash: string,
): Promise<DeployedAgent> {
  return prisma.$transaction(async (tx) => {
    await tx.deployPayment.create({
      data: {
        deployedAgentId: deployId,
        amountUsd: 0,
        txHash,
        status: "confirmed",
      },
    });
    return tx.deployedAgent.update({
      where: { id: deployId },
      data: { deployPaymentTx: txHash, status: "provisioning" },
    });
  });
}

/** Dev/MVP: skip payment gate and move straight to provisioning. */
export function skipPaymentForDeploy(id: string): Promise<DeployedAgent> {
  return prisma.deployedAgent.update({
    where: { id },
    data: { status: "provisioning" },
  });
}

export async function decryptTelegramBotToken(
  agent: Pick<DeployedAgent, "telegramBotTokenEnc">,
  encryptionSecret: string | null,
): Promise<string | null> {
  if (!agent.telegramBotTokenEnc || !encryptionSecret) return null;
  const { decryptSecret } = await import("./crypto.js");
  return decryptSecret(agent.telegramBotTokenEnc, encryptionSecret);
}

export function parseDeployBrainConfig(
  agent: Pick<DeployedAgent, "brainConfig">,
): DeployBrainConfig | null {
  if (!agent.brainConfig) return null;
  try {
    const parsed = JSON.parse(agent.brainConfig) as DeployBrainConfig;
    return parsed && typeof parsed === "object" && parsed.enabled ? parsed : null;
  } catch {
    return null;
  }
}

export async function decryptBrainBotToken(
  agent: Pick<DeployedAgent, "brainBotTokenEnc">,
  encryptionSecret: string | null,
): Promise<string | null> {
  if (!agent.brainBotTokenEnc || !encryptionSecret) return null;
  const { decryptSecret } = await import("./crypto.js");
  return decryptSecret(agent.brainBotTokenEnc, encryptionSecret);
}

export async function maxWalletDerivationIndex(): Promise<number> {
  const row = await prisma.deployedAgent.aggregate({
    _max: { walletDerivationIndex: true },
  });
  return row._max.walletDerivationIndex ?? -1;
}

export const GAMEARENA_SKILL_ID = "gaming/wagering/gamearena_1v1";
export const ACTIONORDER_SKILL_ID = "gaming/card-fighter/actionorder_vshouse";

/** Deploy statuses that no longer block a new GameArena entry. */
const GAMEARENA_NON_BLOCKING_STATUSES: DeployStatus[] = ["failed", "stopped"];

/** All GameArena deploys with enabled GameArena skill + provisioned play wallet. */
export function listGamearenaDeployedAgents(): Promise<
  (DeployedAgent & { skills: SkillInstall[] })[]
> {
  return prisma.deployedAgent.findMany({
    where: {
      agentAddress: { not: null },
      skills: {
        some: {
          skillId: GAMEARENA_SKILL_ID,
          status: { not: "disabled" },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    include: { skills: true },
  });
}

/** GameArena skill deploys for one owner wallet (partner lookup). */
export function listGamearenaDeployedAgentsByOwner(
  ownerWallet: string,
): Promise<(DeployedAgent & { skills: SkillInstall[] })[]> {
  return prisma.deployedAgent.findMany({
    where: {
      ownerWallet: ownerWallet.toLowerCase(),
      skills: {
        some: {
          skillId: GAMEARENA_SKILL_ID,
          status: { not: "disabled" },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    include: { skills: true },
  });
}

/** First GameArena deploy for an owner (competition entry — oldest by createdAt). */
export function getFirstGamearenaDeployForOwner(
  ownerWallet: string,
): Promise<(DeployedAgent & { skills: SkillInstall[] }) | null> {
  return prisma.deployedAgent.findFirst({
    where: {
      ownerWallet: ownerWallet.toLowerCase(),
      skills: {
        some: {
          skillId: GAMEARENA_SKILL_ID,
          status: { not: "disabled" },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    include: { skills: true },
  });
}

/** Action Order skill deploys for one owner wallet (partner lookup). */
export function listActionOrderDeploysForOwner(
  ownerWallet: string,
): Promise<(DeployedAgent & { skills: SkillInstall[] })[]> {
  return prisma.deployedAgent.findMany({
    where: {
      ownerWallet: ownerWallet.toLowerCase(),
      skills: {
        some: {
          skillId: ACTIONORDER_SKILL_ID,
          status: { not: "disabled" },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    include: { skills: true },
  });
}

/** First Action Order deploy for an owner (oldest by createdAt). */
export function getFirstActionOrderDeployForOwner(
  ownerWallet: string,
): Promise<(DeployedAgent & { skills: SkillInstall[] }) | null> {
  return prisma.deployedAgent.findFirst({
    where: {
      ownerWallet: ownerWallet.toLowerCase(),
      skills: {
        some: {
          skillId: ACTIONORDER_SKILL_ID,
          status: { not: "disabled" },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    include: { skills: true },
  });
}

export interface ActionOrderAgentRegistryEntry {
  agentAddress: string;
  deployId: string;
  displayName: string;
  ownerWallet: string | null;
  status: string;
  verified: boolean;
  deployedAt: Date | null;
}

const actionOrderProvisionedWhere = {
  agentAddress: { not: null },
  skills: {
    some: {
      skillId: ACTIONORDER_SKILL_ID,
      status: { not: "disabled" },
    },
  },
} as const;

/** All provisioned Action Order play wallets (partner agent leaderboard registry). */
export async function listActionOrderAgentRegistry(opts: {
  page: number;
  pageSize: number;
  verifiedOnly?: boolean;
}): Promise<{ rows: ActionOrderAgentRegistryEntry[]; total: number }> {
  const deploys = await prisma.deployedAgent.findMany({
    where: actionOrderProvisionedWhere,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      displayName: true,
      agentAddress: true,
      ownerWallet: true,
      status: true,
      deployedAt: true,
    },
  });

  const addresses = deploys
    .map((d) => d.agentAddress)
    .filter((a): a is string => a != null);
  const credentials =
    addresses.length > 0
      ? await prisma.agentCredential.findMany({
          where: { agent: { in: addresses } },
          select: { agent: true, revokedAt: true },
        })
      : [];
  const verifiedSet = new Set(
    credentials
      .filter((c) => c.revokedAt === null)
      .map((c) => c.agent.toLowerCase()),
  );

  let rows = deploys
    .filter((d): d is typeof d & { agentAddress: string } => d.agentAddress != null)
    .map((d) => ({
      agentAddress: d.agentAddress,
      deployId: d.id,
      displayName: d.displayName,
      ownerWallet: d.ownerWallet,
      status: d.status,
      verified: verifiedSet.has(d.agentAddress.toLowerCase()),
      deployedAt: d.deployedAt,
    }));

  if (opts.verifiedOnly) {
    rows = rows.filter((r) => r.verified);
  }

  const total = rows.length;
  const start = (opts.page - 1) * opts.pageSize;
  const paged = rows.slice(start, start + opts.pageSize);

  return { rows: paged, total };
}

/** Lookup one play wallet for Action Order partner integrations. */
export async function lookupActionOrderAgentRegistry(
  agentAddress: string,
): Promise<ActionOrderAgentRegistryEntry | null> {
  const normalized = agentAddress.toLowerCase();
  const deploy = await prisma.deployedAgent.findFirst({
    where: {
      agentAddress: { equals: normalized, mode: "insensitive" },
      skills: {
        some: {
          skillId: ACTIONORDER_SKILL_ID,
          status: { not: "disabled" },
        },
      },
    },
    select: {
      id: true,
      displayName: true,
      agentAddress: true,
      ownerWallet: true,
      status: true,
      deployedAt: true,
    },
  });
  if (!deploy?.agentAddress) return null;

  const credential = await prisma.agentCredential.findUnique({
    where: { agent: deploy.agentAddress },
    select: { revokedAt: true },
  });

  return {
    agentAddress: deploy.agentAddress,
    deployId: deploy.id,
    displayName: deploy.displayName,
    ownerWallet: deploy.ownerWallet,
    status: deploy.status,
    verified: Boolean(credential && credential.revokedAt === null),
    deployedAt: deploy.deployedAt,
  };
}

/** Blocks a second GameArena deploy for the same owner wallet (competition rule). */
export function findBlockingGamearenaDeployForOwner(
  ownerWallet: string,
  excludeDeployId?: string,
): Promise<(DeployedAgent & { skills: SkillInstall[] }) | null> {
  return prisma.deployedAgent.findFirst({
    where: {
      ownerWallet: ownerWallet.toLowerCase(),
      status: { notIn: GAMEARENA_NON_BLOCKING_STATUSES },
      skills: {
        some: {
          skillId: GAMEARENA_SKILL_ID,
          status: { not: "disabled" },
        },
      },
      ...(excludeDeployId ? { id: { not: excludeDeployId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { skills: true },
  });
}

/** Blocks a second GameArena deploy for the same GoodDollar human (stronger sybil check). */
export async function findBlockingGamearenaDeployForHumanRoot(
  humanRoot: string,
  excludeDeployId?: string,
): Promise<(DeployedAgent & { skills: SkillInstall[] }) | null> {
  const creds = await prisma.agentCredential.findMany({
    where: { humanRoot: humanRoot.toLowerCase(), revokedAt: null },
    select: { agent: true },
  });
  const agentAddresses = creds.map((c) => c.agent.toLowerCase());
  if (!agentAddresses.length) return null;

  return prisma.deployedAgent.findFirst({
    where: {
      agentAddress: { in: agentAddresses, mode: "insensitive" },
      status: { notIn: GAMEARENA_NON_BLOCKING_STATUSES },
      skills: {
        some: {
          skillId: GAMEARENA_SKILL_ID,
          status: { not: "disabled" },
        },
      },
      ...(excludeDeployId ? { id: { not: excludeDeployId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { skills: true },
  });
}

export function parseDeployConfiguration(
  agent: Pick<DeployedAgent, "configuration">,
): Record<string, string> {
  if (!agent.configuration) return {};
  try {
    const parsed = JSON.parse(agent.configuration) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function updateSkillInstall(
  deployedAgentId: string,
  skillId: string,
  data: Partial<{
    status: string;
    configJson: string | null;
    lastError: string | null;
    activatedAt: Date | null;
  }>,
): Promise<SkillInstall> {
  return prisma.skillInstall.update({
    where: {
      deployedAgentId_skillId: { deployedAgentId, skillId },
    },
    data,
  });
}

export function mergeSkillInstallConfiguration(
  existing: string | null | undefined,
  patch: Record<string, string>,
): Record<string, string> {
  const base: Record<string, string> = existing
    ? (JSON.parse(existing) as Record<string, string>)
    : {};
  const merged = { ...base, ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === "") delete merged[key];
  }
  return merged;
}

export async function patchSkillInstallConfiguration(
  deployedAgentId: string,
  skillId: string,
  patch: Record<string, string>,
): Promise<SkillInstall> {
  const install = await prisma.skillInstall.findUnique({
    where: {
      deployedAgentId_skillId: { deployedAgentId, skillId },
    },
  });
  if (!install) throw new Error(`skill not installed: ${skillId}`);
  const merged = mergeSkillInstallConfiguration(install.configJson, patch);
  return updateSkillInstall(deployedAgentId, skillId, {
    configJson: JSON.stringify(merged),
  });
}
