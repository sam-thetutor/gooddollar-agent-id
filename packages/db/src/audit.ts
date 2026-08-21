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

function auditAgentKey(metadata: unknown): string | null {
  const agent = (metadata as { agent?: string } | null)?.agent;
  return agent ? agent.toLowerCase() : null;
}

/**
 * Explorer feed: one row per agent (newest event wins). Re-issues of the same
 * agent wallet would otherwise flood the sidebar with duplicate "Registered" lines.
 */
export function dedupeAuditEventsByAgent(
  events: AuditEvent[],
  limit: number,
): AuditEvent[] {
  const seen = new Set<string>();
  const out: AuditEvent[] = [];
  for (const event of events) {
    const key = auditAgentKey(event.metadata);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(event);
    if (out.length >= limit) break;
  }
  return out;
}

/** Most recent audit events (registrations, revocations) for the explorer feed. */
export async function listRecentAuditEvents(limit = 25): Promise<AuditEvent[]> {
  const rows = await prisma.auditLog.findMany({
    where: { eventType: { in: ["agent_id_issued", "agent_id_revoked"] } },
    orderBy: { createdAt: "desc" },
    // Over-fetch: many rows can be re-issues of the same agent before we have
    // `limit` unique agents.
    take: Math.min(500, limit * 20),
  });
  const events = rows.map((r) => ({
    eventType: r.eventType,
    metadata: r.metadata,
    createdAt: r.createdAt,
  }));
  return dedupeAuditEventsByAgent(events, limit);
}
