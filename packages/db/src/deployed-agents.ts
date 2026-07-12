import type { DeployedAgent, SkillInstall } from "@prisma/client";
import { prisma } from "./client.js";

export type DeployStatus =
  | "pending_payment"
  | "provisioning"
  | "installing"
  | "starting"
  | "running"
  | "paused"
  | "failed"
  | "stopped";

export interface DeploySkillInput {
  skillId: string;
  registryPath: string;
}

export interface CreateDeployedAgentInput {
  displayName: string;
  template?: string;
  ownerWallet?: string | null;
  skills?: DeploySkillInput[];
  configuration?: Record<string, string> | null;
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

  return prisma.deployedAgent.create({
    data: {
      displayName: input.displayName,
      template,
      ownerWallet: input.ownerWallet?.toLowerCase() ?? null,
      status: "pending_payment",
      configuration,
      telegramBotTokenEnc,
      skills: {
        create: skills.map((s) => ({
          skillId: s.skillId,
          registryPath: s.registryPath,
          status: "pending",
        })),
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
