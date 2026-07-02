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

/** Outcome of an atomic issue attempt. */
export type IssueOutcome =
  | { ok: true; credential: AgentCredential }
  | { ok: false; error: "OPERATOR_MISMATCH"; storedOperator: string }
  | { ok: false; error: "STALE_NONCE"; storedNonce: string }
  | { ok: false; error: "AGENT_CAP_REACHED"; active: number; max: number };

/**
 * Atomically issue (create or re-issue) a credential with all invariants
 * enforced inside one serializable transaction, closing three gaps that a
 * check-then-write flow leaves open:
 *   - **Operator hijack:** a stored agent may only be re-issued by the same
 *     operator that first registered it.
 *   - **Replay / un-revoke:** a re-issue must carry a strictly greater `nonce`
 *     than the stored one, so an old signed credential can't be replayed to
 *     overwrite or silently un-revoke a newer/revoked registration.
 *   - **Cap race:** the per-human active-agent cap is counted and enforced in
 *     the same transaction as the write.
 */
export function issueAgentCredential(
  data: AgentCredentialInput,
  maxPerHuman: number,
): Promise<IssueOutcome> {
  return prisma.$transaction(
    async (tx): Promise<IssueOutcome> => {
      const existing = await tx.agentCredential.findUnique({
        where: { agent: data.agent },
      });

      if (existing) {
        if (existing.operator.toLowerCase() !== data.operator.toLowerCase()) {
          return {
            ok: false,
            error: "OPERATOR_MISMATCH",
            storedOperator: existing.operator,
          };
        }
        if (BigInt(data.nonce) <= BigInt(existing.nonce)) {
          return {
            ok: false,
            error: "STALE_NONCE",
            storedNonce: existing.nonce,
          };
        }
      }

      const active = await tx.agentCredential.count({
        where: {
          humanRoot: data.humanRoot,
          revokedAt: null,
          agent: { not: data.agent },
        },
      });
      if (active >= maxPerHuman) {
        return { ok: false, error: "AGENT_CAP_REACHED", active, max: maxPerHuman };
      }

      const credential = await tx.agentCredential.upsert({
        where: { agent: data.agent },
        create: { ...data, revokedAt: null },
        update: { ...data, revokedAt: null },
      });
      return { ok: true, credential };
    },
    { isolationLevel: "Serializable" },
  );
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
