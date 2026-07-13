import { existsSync, readFileSync } from "node:fs";
import { prisma } from "./client.js";

export interface PersistedMatchRecord {
  matchId: string;
  gameType: number;
  wagerGs: number;
  result: "won" | "lost" | "unresolved";
  mode: "offchain" | "onchain";
  at: string;
}

export interface PersistedRefillRecord {
  priceGs: number;
  txHash: string;
  at: string;
}

interface GamearenaStateFile {
  day?: string;
  lostTodayGs?: number;
  matchesToday?: number;
  refillsToday?: number;
  spentOnRefillsTodayGs?: number;
  refillHistory?: PersistedRefillRecord[];
  history?: Array<{
    matchId: string;
    gameType: number;
    wagerGs: number;
    result: "won" | "lost" | "unresolved";
    mode?: "offchain" | "onchain";
    at: string;
  }>;
}

function parsePlayedAt(at: string): Date {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function recordDeployMatch(
  deployedAgentId: string,
  rec: PersistedMatchRecord,
): Promise<void> {
  await prisma.deployMatch.upsert({
    where: {
      deployedAgentId_matchId: {
        deployedAgentId,
        matchId: rec.matchId,
      },
    },
    create: {
      deployedAgentId,
      matchId: rec.matchId,
      gameType: rec.gameType,
      wagerGs: rec.wagerGs,
      result: rec.result,
      mode: rec.mode,
      playedAt: parsePlayedAt(rec.at),
    },
    update: {
      gameType: rec.gameType,
      wagerGs: rec.wagerGs,
      result: rec.result,
      mode: rec.mode,
      playedAt: parsePlayedAt(rec.at),
    },
  });
}

export async function recordDeployRefill(
  deployedAgentId: string,
  rec: PersistedRefillRecord,
): Promise<void> {
  await prisma.deployRefill.upsert({
    where: {
      deployedAgentId_txHash: {
        deployedAgentId,
        txHash: rec.txHash,
      },
    },
    create: {
      deployedAgentId,
      priceGs: rec.priceGs,
      txHash: rec.txHash,
      refilledAt: parsePlayedAt(rec.at),
    },
    update: {
      priceGs: rec.priceGs,
      refilledAt: parsePlayedAt(rec.at),
    },
  });
}

export async function appendDeployLogLine(
  deployedAgentId: string,
  message: string,
  loggedAt?: string,
): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed) return;

  const at = loggedAt ? parsePlayedAt(loggedAt) : new Date();
  const recent = await prisma.deployLogLine.findFirst({
    where: { deployedAgentId, message: trimmed },
    orderBy: { loggedAt: "desc" },
  });
  if (recent && Math.abs(recent.loggedAt.getTime() - at.getTime()) < 2000) {
    return;
  }

  await prisma.deployLogLine.create({
    data: {
      deployedAgentId,
      message: trimmed,
      loggedAt: at,
    },
  });
}

export async function listDeployMatches(
  deployedAgentId: string,
): Promise<PersistedMatchRecord[]> {
  const rows = await prisma.deployMatch.findMany({
    where: { deployedAgentId },
    orderBy: { playedAt: "asc" },
  });
  return rows.map((row) => ({
    matchId: row.matchId,
    gameType: row.gameType,
    wagerGs: Number(row.wagerGs),
    result: row.result as PersistedMatchRecord["result"],
    mode: row.mode as PersistedMatchRecord["mode"],
    at: row.playedAt.toISOString(),
  }));
}

export async function getDeployLogTail(
  deployedAgentId: string,
  lines = 12,
): Promise<string | null> {
  const rows = await prisma.deployLogLine.findMany({
    where: { deployedAgentId },
    orderBy: { loggedAt: "desc" },
    take: lines,
  });
  if (!rows.length) return null;
  return rows
    .slice()
    .reverse()
    .map((r) => r.message)
    .join("\n");
}

export async function syncGamearenaStateFile(
  deployedAgentId: string,
  statePath: string,
): Promise<number> {
  if (!existsSync(statePath)) return 0;

  let raw: GamearenaStateFile;
  try {
    raw = JSON.parse(readFileSync(statePath, "utf8")) as GamearenaStateFile;
  } catch {
    return 0;
  }

  let synced = 0;
  for (const rec of raw.history ?? []) {
    await recordDeployMatch(deployedAgentId, {
      matchId: rec.matchId,
      gameType: rec.gameType,
      wagerGs: rec.wagerGs,
      result: rec.result,
      mode: rec.mode ?? "onchain",
      at: rec.at,
    });
    synced += 1;
  }

  for (const rec of raw.refillHistory ?? []) {
    await recordDeployRefill(deployedAgentId, {
      priceGs: rec.priceGs,
      txHash: rec.txHash,
      at: rec.at,
    });
  }

  return synced;
}

export async function syncDeployLogFile(
  deployedAgentId: string,
  logPath: string,
): Promise<number> {
  if (!existsSync(logPath)) return 0;

  let raw: string;
  try {
    raw = readFileSync(logPath, "utf8");
  } catch {
    return 0;
  }

  const lines = raw.split("\n").filter((l) => l.trim());
  if (!lines.length) return 0;

  const last = await prisma.deployLogLine.findFirst({
    where: { deployedAgentId },
    orderBy: { loggedAt: "desc" },
  });

  let startIdx = 0;
  if (last) {
    const idx = lines.lastIndexOf(last.message);
    if (idx >= 0) startIdx = idx + 1;
  }

  let synced = 0;
  for (const line of lines.slice(startIdx)) {
    await appendDeployLogLine(deployedAgentId, line);
    synced += 1;
  }
  return synced;
}
