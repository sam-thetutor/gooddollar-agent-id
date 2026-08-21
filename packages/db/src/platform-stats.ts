import { prisma } from "./client.js";

export interface SkillInstallBreakdown {
  skillId: string;
  label: string;
  total: number;
  activated: number;
  failed: number;
}

export interface SkillGameBreakdown {
  skillId: string;
  label: string;
  played: number;
  wins: number;
  losses: number;
  unresolved: number;
  wagerGs: string;
}

export interface RecentMatchRow {
  matchId: string;
  skillId: string | null;
  skillLabel: string;
  deployId: string;
  deployName: string;
  result: string;
  wagerGs: string;
  playedAt: string;
}

export interface DailyGameRow {
  date: string;
  total: number;
  bySkill: Record<string, number>;
}

export interface PlatformStats {
  deploys: {
    total: number;
    byStatus: Record<string, number>;
    byTemplate: Record<string, number>;
    withAgentId: number;
    running: number;
    healthy: number;
    revoked: number;
  };
  skills: {
    totalInstalls: number;
    bySkill: SkillInstallBreakdown[];
  };
  games: {
    total: number;
    totalWagerGs: string;
    today: number;
    liveNow: number;
    bySkill: SkillGameBreakdown[];
  };
  payments: {
    total: number;
    completed: number;
    totalUsd: string;
  };
  recentMatches: RecentMatchRow[];
  dailyGames: DailyGameRow[];
}

function skillLabel(skillId: string | null): string {
  if (!skillId) return "unknown";
  return skillId.split("/").pop() ?? skillId;
}

function decimalToString(value: { toString(): string } | null | undefined): string {
  if (value == null) return "0";
  return value.toString();
}

function toCountMap<T extends { _count: { _all: number } }>(
  rows: T[],
  pick: (row: T) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[pick(row)] = row._count._all;
  }
  return out;
}

type SkillStatusRow = { skill_id: string; status: string; count: bigint };
type StatusCountRow = { status: string; count: bigint };

function buildSkillInstallMap(rows: SkillStatusRow[]) {
  const skillInstallMap = new Map<
    string,
    { total: number; activated: number; failed: number }
  >();
  for (const row of rows) {
    const entry = skillInstallMap.get(row.skill_id) ?? {
      total: 0,
      activated: 0,
      failed: 0,
    };
    const count = Number(row.count);
    entry.total += count;
    if (row.status === "failed") entry.failed += count;
    else if (row.status === "installed" || row.status === "active") {
      entry.activated += count;
    }
    skillInstallMap.set(row.skill_id, entry);
  }
  return skillInstallMap;
}

const ACTIVE_AGENT_DEPLOY_FROM = `
FROM deployed_agents d
INNER JOIN agent_credentials c ON LOWER(c.agent) = LOWER(d.agent_address)
WHERE d.agent_address IS NOT NULL AND c.revoked_at IS NULL`;

export async function getPlatformStats(): Promise<PlatformStats> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const heartbeatCutoff = new Date(now.getTime() - 5 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [
    deployTotal,
    deployByStatus,
    deployByTemplate,
    deployRunning,
    deployHealthy,
    deployRevoked,
    skillBySkillStatus,
    agentsWithSkills,
    matchTotal,
    matchBySkillResult,
    matchToday,
    wagerSum,
    paymentRows,
    recentMatches,
    liveNow,
    dailyRows,
  ] = await Promise.all([
    prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*)::bigint AS count ${ACTIVE_AGENT_DEPLOY_FROM}`,
    ).then((rows) => Number(rows[0]?.count ?? 0n)),
    prisma.$queryRawUnsafe<StatusCountRow[]>(
      `SELECT d.status, COUNT(*)::bigint AS count ${ACTIVE_AGENT_DEPLOY_FROM} GROUP BY d.status`,
    ),
    prisma.deployedAgent.groupBy({
      by: ["template"],
      _count: { _all: true },
    }),
    prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*)::bigint AS count ${ACTIVE_AGENT_DEPLOY_FROM} AND d.status = 'running'`,
    ).then((rows) => Number(rows[0]?.count ?? 0n)),
    prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*)::bigint AS count ${ACTIVE_AGENT_DEPLOY_FROM} AND d.status = 'running' AND d.last_heartbeat_at >= $1`,
      heartbeatCutoff,
    ).then((rows) => Number(rows[0]?.count ?? 0n)),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM deployed_agents d
      INNER JOIN agent_credentials c ON LOWER(c.agent) = LOWER(d.agent_address)
      WHERE d.agent_address IS NOT NULL AND c.revoked_at IS NOT NULL
    `.then((rows) => Number(rows[0]?.count ?? 0n)),
    prisma.$queryRaw<SkillStatusRow[]>`
      SELECT si.skill_id, si.status, COUNT(*)::bigint AS count
      FROM skill_installs si
      INNER JOIN deployed_agents d ON d.id = si.deployed_agent_id
      INNER JOIN agent_credentials c ON LOWER(c.agent) = LOWER(d.agent_address)
      WHERE d.agent_address IS NOT NULL AND c.revoked_at IS NULL
      GROUP BY si.skill_id, si.status
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT LOWER(d.agent_address))::bigint AS count
      FROM skill_installs si
      INNER JOIN deployed_agents d ON d.id = si.deployed_agent_id
      INNER JOIN agent_credentials c ON LOWER(c.agent) = LOWER(d.agent_address)
      WHERE d.agent_address IS NOT NULL AND c.revoked_at IS NULL
    `.then((rows) => Number(rows[0]?.count ?? 0n)),
    prisma.deployMatch.count(),
    prisma.deployMatch.groupBy({
      by: ["skillId", "result"],
      _count: { _all: true },
      _sum: { wagerGs: true },
    }),
    prisma.deployMatch.count({ where: { playedAt: { gte: todayStart } } }),
    prisma.deployMatch.aggregate({ _sum: { wagerGs: true } }),
    prisma.deployPayment.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amountUsd: true },
    }),
    prisma.deployMatch.findMany({
      orderBy: { playedAt: "desc" },
      take: 25,
      include: {
        deployedAgent: { select: { id: true, displayName: true } },
      },
    }),
    prisma.deployedAgent.count({
      where: {
        status: "running",
        activeArenaMatchId: { not: null },
      },
    }),
    prisma.deployMatch.findMany({
      where: { playedAt: { gte: fourteenDaysAgo } },
      select: { playedAt: true, skillId: true },
    }),
  ]);

  const skillInstallMap = buildSkillInstallMap(skillBySkillStatus);

  const deployStatusMap: Record<string, number> = {};
  for (const row of deployByStatus) {
    deployStatusMap[row.status] = Number(row.count);
  }

  const skillGameMap = new Map<
    string,
    {
      played: number;
      wins: number;
      losses: number;
      unresolved: number;
      wagerGs: bigint;
    }
  >();
  for (const row of matchBySkillResult) {
    const key = row.skillId ?? "unknown";
    const entry = skillGameMap.get(key) ?? {
      played: 0,
      wins: 0,
      losses: 0,
      unresolved: 0,
      wagerGs: 0n,
    };
    entry.played += row._count._all;
    if (row.result === "won") entry.wins += row._count._all;
    else if (row.result === "lost") entry.losses += row._count._all;
    else entry.unresolved += row._count._all;
    const wager = row._sum.wagerGs;
    if (wager != null) {
      entry.wagerGs += BigInt(decimalToString(wager).split(".")[0] ?? "0");
    }
    skillGameMap.set(key, entry);
  }

  let paymentTotal = 0;
  let paymentCompleted = 0;
  let paymentUsd = 0n;
  for (const row of paymentRows) {
    paymentTotal += row._count._all;
    if (row.status === "confirmed" || row.status === "completed") {
      paymentCompleted += row._count._all;
      const usd = row._sum.amountUsd;
      if (usd != null) {
        paymentUsd += BigInt(decimalToString(usd).split(".")[0] ?? "0");
      }
    }
  }

  const dailyMap = new Map<string, DailyGameRow>();
  for (const row of dailyRows) {
    const date = row.playedAt.toISOString().slice(0, 10);
    const skillKey = row.skillId ?? "unknown";
    const existing = dailyMap.get(date) ?? { date, total: 0, bySkill: {} };
    existing.total += 1;
    existing.bySkill[skillKey] = (existing.bySkill[skillKey] ?? 0) + 1;
    dailyMap.set(date, existing);
  }

  return {
    deploys: {
      total: deployTotal,
      byStatus: deployStatusMap,
      byTemplate: toCountMap(deployByTemplate, (r) => r.template),
      withAgentId: deployTotal,
      running: deployRunning,
      healthy: deployHealthy,
      revoked: deployRevoked,
    },
    skills: {
      totalInstalls: agentsWithSkills,
      bySkill: [...skillInstallMap.entries()]
        .map(([skillId, counts]) => ({
          skillId,
          label: skillLabel(skillId),
          ...counts,
        }))
        .sort((a, b) => b.total - a.total),
    },
    games: {
      total: matchTotal,
      totalWagerGs: decimalToString(wagerSum._sum.wagerGs).split(".")[0] ?? "0",
      today: matchToday,
      liveNow,
      bySkill: [...skillGameMap.entries()]
        .map(([skillId, counts]) => ({
          skillId,
          label: skillLabel(skillId === "unknown" ? null : skillId),
          played: counts.played,
          wins: counts.wins,
          losses: counts.losses,
          unresolved: counts.unresolved,
          wagerGs: counts.wagerGs.toString(),
        }))
        .sort((a, b) => b.played - a.played),
    },
    payments: {
      total: paymentTotal,
      completed: paymentCompleted,
      totalUsd: paymentUsd.toString(),
    },
    recentMatches: recentMatches.map((m) => ({
      matchId: m.matchId,
      skillId: m.skillId,
      skillLabel: skillLabel(m.skillId),
      deployId: m.deployedAgent.id,
      deployName: m.deployedAgent.displayName,
      result: m.result,
      wagerGs: decimalToString(m.wagerGs).split(".")[0] ?? "0",
      playedAt: m.playedAt.toISOString(),
    })),
    dailyGames: [...dailyMap.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}
