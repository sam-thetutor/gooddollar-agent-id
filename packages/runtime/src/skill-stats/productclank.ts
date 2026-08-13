import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dashboardPanelForSkillId } from "@goodagent/shared";
import { getDeployLogTailForSkill } from "@goodagent/db";
import type { SkillStatsAdapter } from "./types.js";

const PRODUCTCLANK_SKILL_ID = "work/social/productclank_participant";

interface PcState {
  submissions?: Array<{ replyId: string; replyUrl: string; submittedAt: string }>;
  submittedByDay?: Record<string, number>;
  lastEarnings?: {
    points?: number;
    credits?: number;
    approved?: number;
    rejected?: number;
    strikes?: number;
    proClaimable?: number;
    proTotalClaimed?: number;
    fetchedAt?: string;
  };
}

interface PcQueue {
  pending?: unknown[];
  posted?: unknown[];
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export const productClankSkillStatsAdapter: SkillStatsAdapter = {
  supports: (skillId) => skillId === PRODUCTCLANK_SKILL_ID,
  async collect(ctx) {
    const folder = ctx.registryPath.split("/").pop() || "productclank-participant";
    const skillDir = resolve(ctx.agentsRoot, ctx.deployId, "skills", folder);
    const state = readJson<PcState>(resolve(skillDir, "state.json"));
    const queue = readJson<PcQueue>(resolve(skillDir, "amplify-queue.json"));
    const logTail = await getDeployLogTailForSkill(ctx.deployId, ctx.skillId, 16);

    const submissions = state?.submissions ?? [];
    const day = new Date().toISOString().slice(0, 10);
    const submittedToday = state?.submittedByDay?.[day] ?? 0;
    const earnings = state?.lastEarnings;
    const pendingDrafts = queue?.pending?.length ?? 0;
    const awaitingSubmit = queue?.posted?.length ?? 0;

    const parts: string[] = [];
    if (earnings?.points != null) parts.push(`${earnings.points} pts`);
    if (earnings?.credits) parts.push(`${earnings.credits} credits`);
    if (pendingDrafts > 0)
      parts.push(`${pendingDrafts} draft${pendingDrafts === 1 ? "" : "s"} awaiting approval`);
    if (awaitingSubmit > 0) parts.push(`${awaitingSubmit} posted, awaiting submit`);
    if (earnings?.strikes) parts.push(`${earnings.strikes} strike${earnings.strikes === 1 ? "" : "s"}`);

    return {
      skillId: ctx.skillId,
      panel: dashboardPanelForSkillId(ctx.skillId),
      gamesPlayed: submissions.length,
      wins: earnings?.approved ?? 0,
      losses: earnings?.rejected ?? 0,
      unresolved: Math.max(
        0,
        submissions.length - (earnings?.approved ?? 0) - (earnings?.rejected ?? 0),
      ),
      matchesToday: submittedToday,
      summary: parts.length
        ? parts.join(" · ")
        : "No campaign activity yet — drafts arrive via the Telegram approval loop.",
      matches: [],
      logTail,
      meta: {
        points: earnings?.points ?? 0,
        credits: earnings?.credits ?? 0,
        approved: earnings?.approved ?? 0,
        rejected: earnings?.rejected ?? 0,
        strikes: earnings?.strikes ?? 0,
        proClaimable: earnings?.proClaimable ?? 0,
        proTotalClaimed: earnings?.proTotalClaimed ?? 0,
        pendingDrafts,
        awaitingSubmit,
        submittedToday,
        submittedTotal: submissions.length,
        dailyCap: ctx.configuration.DAILY_SUBMIT_CAP ?? "10",
        xHandle: ctx.configuration.X_HANDLE ?? "",
        erc8004AgentId: ctx.configuration.ERC8004_AGENT_ID ?? "",
      },
    };
  },
};
