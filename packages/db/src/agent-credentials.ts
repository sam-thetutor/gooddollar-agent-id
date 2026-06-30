import type { AgentCredential } from "@prisma/client";
import { prisma } from "./client.js";

/** Wire-shaped input for storing a signed Agent ID credential (identity-only). */
export interface AgentCredentialInput {
  agent: string;
  operator: string;
  humanRoot: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  chainId: number;
  verifyingContract: string;
}

/** Max active (non-revoked) agents a single GoodDollar human may vouch for. */
export const MAX_AGENTS_PER_HUMAN = 10;

/** Create or replace the credential for an agent (re-issue clears revocation). */
export function upsertAgentCredential(
  data: AgentCredentialInput,
): Promise<AgentCredential> {
  return prisma.agentCredential.upsert({
    where: { agent: data.agent },
    create: { ...data, revokedAt: null },
    update: { ...data, revokedAt: null },
  });
}

export function getAgentCredential(
  agent: string,
): Promise<AgentCredential | null> {
  return prisma.agentCredential.findUnique({ where: { agent } });
}

export function listAgentCredentialsByOperator(
  operator: string,
): Promise<AgentCredential[]> {
  return prisma.agentCredential.findMany({
    where: { operator },
    orderBy: { createdAt: "desc" },
  });
}

/** All credentials a given GoodDollar human (root) has vouched for. */
export function listAgentCredentialsByHumanRoot(
  humanRoot: string,
): Promise<AgentCredential[]> {
  return prisma.agentCredential.findMany({
    where: { humanRoot },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Count the active (non-revoked) agents a human root currently vouches for.
 * `excludeAgent` lets a re-issue of an existing agent skip its own row so it
 * doesn't count against the cap.
 */
export function countActiveAgentsByHumanRoot(
  humanRoot: string,
  excludeAgent?: string,
): Promise<number> {
  return prisma.agentCredential.count({
    where: {
      humanRoot,
      revokedAt: null,
      ...(excludeAgent ? { agent: { not: excludeAgent } } : {}),
    },
  });
}

export function revokeAgentCredential(agent: string): Promise<AgentCredential> {
  return prisma.agentCredential.update({
    where: { agent },
    data: { revokedAt: new Date() },
  });
}
