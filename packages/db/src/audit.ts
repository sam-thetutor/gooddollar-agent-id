import type { Prisma } from "@prisma/client";
import { prisma } from "./client.js";

/** Append-only audit log (e.g. `agent_id_issued`). */
export function writeAudit(
  eventType: string,
  metadata?: Prisma.InputJsonValue,
): Promise<unknown> {
  return prisma.auditLog.create({
    data: { eventType, metadata },
  });
}

export interface AuditEvent {
  eventType: string;
  metadata: unknown;
  createdAt: Date;
}

/** Most recent audit events (registrations, revocations) for the explorer feed. */
export async function listRecentAuditEvents(limit = 25): Promise<AuditEvent[]> {
  const rows = await prisma.auditLog.findMany({
    where: { eventType: { in: ["agent_id_issued", "agent_id_revoked"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    eventType: r.eventType,
    metadata: r.metadata,
    createdAt: r.createdAt,
  }));
}
