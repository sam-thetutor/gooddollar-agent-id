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

export async function maxWalletDerivationIndex(): Promise<number> {
  const row = await prisma.deployedAgent.aggregate({
    _max: { walletDerivationIndex: true },
  });
  return row._max.walletDerivationIndex ?? -1;
}

export const GAMEARENA_SKILL_ID = "gaming/wagering/gamearena_1v1";

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
