import type { AgentCredential } from "@prisma/client";
import { prisma } from "./client.js";

/** Wire-shaped input for storing a signed Agent ID credential. */
export interface AgentCredentialInput {
  agent: string;
  operator: string;
  humanRoot: string;
  scopes: string;
  stake: string;
  budgetCap: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  chainId: number;
  verifyingContract: string;
}

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

export function revokeAgentCredential(agent: string): Promise<AgentCredential> {
  return prisma.agentCredential.update({
    where: { agent },
    data: { revokedAt: new Date() },
  });
}
