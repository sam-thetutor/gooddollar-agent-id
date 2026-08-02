import { dashboardPanelForSkillId, isUbiSkillId } from "@goodagent/shared";
import { getDeployLogTailForSkill } from "@goodagent/db";
import type { SkillStatsAdapter } from "./types.js";

export const ubiSkillStatsAdapter: SkillStatsAdapter = {
  supports: (skillId) => isUbiSkillId(skillId),
  async collect(ctx) {
    const logTail = await getDeployLogTailForSkill(ctx.deployId, ctx.skillId, 16);
    return {
      skillId: ctx.skillId,
      panel: dashboardPanelForSkillId(ctx.skillId),
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      unresolved: 0,
      matchesToday: 0,
      summary: "UBI reminder — subscriber stats via Telegram bot",
      matches: [],
      logTail,
      meta: {
        intervalMinutes: ctx.configuration.REMINDER_INTERVAL_MINUTES ?? "15",
      },
    };
  },
};
