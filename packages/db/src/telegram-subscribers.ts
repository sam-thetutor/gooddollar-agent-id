import type { TelegramSubscriber } from "@prisma/client";
import { prisma } from "./client.js";

/**
 * All subscriber rows are scoped by `deployId` so many hosted reminder bots
 * can share the table. The flagship bot (apps/telegram-bot) uses "" — the
 * schema default — so its historical rows keep working unchanged.
 */
export const FLAGSHIP_DEPLOY_ID = "";

/** Subscribe a chat to reminders for a wallet (re-activates if it existed). */
export function subscribeWallet(
  chatId: string,
  wallet: string,
  deployId: string = FLAGSHIP_DEPLOY_ID,
): Promise<TelegramSubscriber> {
  const normalized = wallet.toLowerCase();
  return prisma.telegramSubscriber.upsert({
    where: {
      deployId_chatId_wallet: { deployId, chatId, wallet: normalized },
    },
    create: { deployId, chatId, wallet: normalized },
    update: { active: true },
  });
}

/** Deactivate every subscription for a chat. Returns how many were active. */
export async function unsubscribeChat(
  chatId: string,
  deployId: string = FLAGSHIP_DEPLOY_ID,
): Promise<number> {
  const result = await prisma.telegramSubscriber.updateMany({
    where: { deployId, chatId, active: true },
    data: { active: false },
  });
  return result.count;
}

/** Deactivate a single wallet subscription for a chat. */
export async function unsubscribeWallet(
  chatId: string,
  wallet: string,
  deployId: string = FLAGSHIP_DEPLOY_ID,
): Promise<boolean> {
  const result = await prisma.telegramSubscriber.updateMany({
    where: { deployId, chatId, wallet: wallet.toLowerCase(), active: true },
    data: { active: false },
  });
  return result.count > 0;
}

/** Active wallet subscriptions for one chat. */
export function listChatSubscriptions(
  chatId: string,
  deployId: string = FLAGSHIP_DEPLOY_ID,
): Promise<TelegramSubscriber[]> {
  return prisma.telegramSubscriber.findMany({
    where: { deployId, chatId, active: true },
    orderBy: { createdAt: "asc" },
  });
}

/** All active subscriptions for one bot (the daily scan set). */
export function listActiveSubscribers(
  deployId: string = FLAGSHIP_DEPLOY_ID,
): Promise<TelegramSubscriber[]> {
  return prisma.telegramSubscriber.findMany({
    where: { deployId, active: true },
  });
}

/** Record that a reminder was sent for the given UBI day. */
export async function markReminded(ids: string[], day: string): Promise<void> {
  if (ids.length === 0) return;
  await prisma.telegramSubscriber.updateMany({
    where: { id: { in: ids } },
    data: { lastRemindedDay: day },
  });
}

/**
 * Record on-chain claims observed for the given UBI day and advance streaks.
 * A wallet claiming on consecutive UBI days grows its streak; a gap resets it
 * to 1. Rows already marked for `day` are left untouched (idempotent).
 */
export async function recordClaims(
  wallets: string[],
  day: string,
  deployId: string = FLAGSHIP_DEPLOY_ID,
): Promise<void> {
  if (wallets.length === 0) return;
  const dayNum = Number(day);
  const normalized = wallets.map((w) => w.toLowerCase());

  const rows = await prisma.telegramSubscriber.findMany({
    where: { deployId, wallet: { in: normalized }, active: true },
  });

  for (const row of rows) {
    if (row.lastClaimedDay === day) continue;
    const prev = row.lastClaimedDay == null ? null : Number(row.lastClaimedDay);
    const streak = prev != null && dayNum - prev === 1 ? row.streak + 1 : 1;
    await prisma.telegramSubscriber.update({
      where: { id: row.id },
      data: {
        lastClaimedDay: day,
        streak,
        bestStreak: Math.max(streak, row.bestStreak),
      },
    });
  }
}

export interface StreakLeaderboardRow {
  wallet: string;
  streak: number;
  bestStreak: number;
}

/** Top current claim streaks among one bot's active subscribers. */
export async function streakLeaderboard(
  deployId: string = FLAGSHIP_DEPLOY_ID,
  limit = 10,
): Promise<StreakLeaderboardRow[]> {
  const rows = await prisma.telegramSubscriber.findMany({
    where: { deployId, active: true, streak: { gt: 0 } },
    orderBy: [{ streak: "desc" }, { bestStreak: "desc" }],
    distinct: ["wallet"],
    take: limit,
    select: { wallet: true, streak: true, bestStreak: true },
  });
  return rows;
}

/**
 * Deactivate subscriptions whose chats blocked the bot (Telegram 403), so we
 * stop scanning and messaging them.
 */
export async function deactivateChats(
  chatIds: string[],
  deployId: string = FLAGSHIP_DEPLOY_ID,
): Promise<void> {
  if (chatIds.length === 0) return;
  await prisma.telegramSubscriber.updateMany({
    where: { deployId, chatId: { in: chatIds } },
    data: { active: false },
  });
}
