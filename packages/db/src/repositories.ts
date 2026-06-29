import { randomUUID } from "node:crypto";
import type {
  ActionStatus,
  ActionType,
  PendingAction,
  Prisma,
  TelegramSession,
} from "@prisma/client";
import { prisma } from "./client.js";

const DEFAULT_TTL_MINUTES = 15;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function getSession(
  telegramId: string,
): Promise<TelegramSession | null> {
  return prisma.telegramSession.findUnique({ where: { telegramId } });
}

/** Load the session, creating an empty one if it doesn't exist yet. */
export function ensureSession(telegramId: string): Promise<TelegramSession> {
  return prisma.telegramSession.upsert({
    where: { telegramId },
    create: { telegramId },
    update: {},
  });
}

export function linkWallet(
  telegramId: string,
  wallet: string,
): Promise<TelegramSession> {
  const walletLinkedAt = new Date();
  return prisma.telegramSession.upsert({
    where: { telegramId },
    create: { telegramId, walletAddress: wallet, walletLinkedAt },
    update: { walletAddress: wallet, walletLinkedAt },
  });
}

export function setVerified(
  telegramId: string,
  verified: boolean,
): Promise<TelegramSession> {
  return prisma.telegramSession.update({
    where: { telegramId },
    data: { verified, verifiedAt: verified ? new Date() : null },
  });
}

/** Remove a user's wallet + verification, keep the session row. */
export function disconnectWallet(
  telegramId: string,
): Promise<TelegramSession> {
  return prisma.telegramSession.update({
    where: { telegramId },
    data: {
      walletAddress: null,
      walletLinkedAt: null,
      verified: false,
      verifiedAt: null,
    },
  });
}

/** Hard-delete the session and all its pending actions (GDPR /disconnect). */
export async function deleteSession(telegramId: string): Promise<void> {
  await prisma.pendingAction.deleteMany({ where: { telegramId } });
  await prisma.telegramSession.deleteMany({ where: { telegramId } });
}

// ---------------------------------------------------------------------------
// Pending actions
// ---------------------------------------------------------------------------

export interface CreatePendingActionArgs {
  telegramId: string;
  actionType: ActionType;
  /** Validated JSON object (e.g. transfer/stream params). */
  payload: Record<string, unknown>;
  ttlMinutes?: number;
}

export function createPendingAction(
  args: CreatePendingActionArgs,
): Promise<PendingAction> {
  const ttl = args.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttl * 60_000);
  return prisma.pendingAction.create({
    data: {
      id: `act_${randomUUID()}`,
      telegramId: args.telegramId,
      actionType: args.actionType,
      payload: args.payload as Prisma.InputJsonValue,
      expiresAt,
    },
  });
}

export function getPendingAction(id: string): Promise<PendingAction | null> {
  return prisma.pendingAction.findUnique({ where: { id } });
}

export function listPendingActions(
  telegramId: string,
  status?: ActionStatus,
): Promise<PendingAction[]> {
  return prisma.pendingAction.findMany({
    where: { telegramId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export function completePendingAction(
  id: string,
  txHash: string,
): Promise<PendingAction> {
  return prisma.pendingAction.update({
    where: { id },
    data: { status: "completed", txHash, completedAt: new Date() },
  });
}

export function failPendingAction(id: string): Promise<PendingAction> {
  return prisma.pendingAction.update({
    where: { id },
    data: { status: "failed" },
  });
}

/** Mark all still-pending actions past their expiry as expired. Returns count. */
export async function expireStaleActions(): Promise<number> {
  const { count } = await prisma.pendingAction.updateMany({
    where: { status: "pending", expiresAt: { lt: new Date() } },
    data: { status: "expired" },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Audit log (append-only)
// ---------------------------------------------------------------------------

export function writeAudit(
  eventType: string,
  telegramId?: string,
  metadata?: Prisma.InputJsonValue,
): Promise<unknown> {
  return prisma.auditLog.create({
    data: { eventType, telegramId, metadata },
  });
}
