import type { TelegramSubscriber } from "@prisma/client";
import { prisma } from "./client.js";

/** Subscribe a chat to reminders for a wallet (re-activates if it existed). */
export function subscribeWallet(
  chatId: string,
  wallet: string,
): Promise<TelegramSubscriber> {
  const normalized = wallet.toLowerCase();
  return prisma.telegramSubscriber.upsert({
    where: { chatId_wallet: { chatId, wallet: normalized } },
    create: { chatId, wallet: normalized },
    update: { active: true },
  });
}

/** Deactivate every subscription for a chat. Returns how many were active. */
export async function unsubscribeChat(chatId: string): Promise<number> {
  const result = await prisma.telegramSubscriber.updateMany({
    where: { chatId, active: true },
    data: { active: false },
  });
  return result.count;
}

/** Deactivate a single wallet subscription for a chat. */
export async function unsubscribeWallet(
  chatId: string,
  wallet: string,
): Promise<boolean> {
  const result = await prisma.telegramSubscriber.updateMany({
    where: { chatId, wallet: wallet.toLowerCase(), active: true },
    data: { active: false },
  });
  return result.count > 0;
}

/** Active wallet subscriptions for one chat. */
export function listChatSubscriptions(
  chatId: string,
): Promise<TelegramSubscriber[]> {
  return prisma.telegramSubscriber.findMany({
    where: { chatId, active: true },
    orderBy: { createdAt: "asc" },
  });
}

/** All active subscriptions (the daily scan set). */
export function listActiveSubscribers(): Promise<TelegramSubscriber[]> {
  return prisma.telegramSubscriber.findMany({
    where: { active: true },
  });
}

/** Record that a reminder was sent for the given UBI day. */
export async function markReminded(
  ids: string[],
  day: string,
): Promise<void> {
  if (ids.length === 0) return;
  await prisma.telegramSubscriber.updateMany({
    where: { id: { in: ids } },
    data: { lastRemindedDay: day },
  });
}

/**
 * Deactivate subscriptions whose chats blocked the bot (Telegram 403), so we
 * stop scanning and messaging them.
 */
export async function deactivateChats(chatIds: string[]): Promise<void> {
  if (chatIds.length === 0) return;
  await prisma.telegramSubscriber.updateMany({
    where: { chatId: { in: chatIds } },
    data: { active: false },
  });
}
