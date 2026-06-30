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
