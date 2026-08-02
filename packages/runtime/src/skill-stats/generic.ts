import { dashboardPanelForSkillId } from "@goodagent/shared";
import { getDeployLogTailForSkill, listDeployMatchesForSkill } from "@goodagent/db";
import type { SkillStatsAdapter } from "./types.js";

export const genericSkillStatsAdapter: SkillStatsAdapter = {
  supports: () => true,
  async collect(ctx) {
    const [matches, logTail] = await Promise.all([
      listDeployMatchesForSkill(ctx.deployId, ctx.skillId, { includeLegacy: false }),
      getDeployLogTailForSkill(ctx.deployId, ctx.skillId, 12),
    ]);

    const wins = matches.filter((m) => m.result === "won").length;
    const losses = matches.filter((m) => m.result === "lost").length;
    const unresolved = matches.filter((m) => m.result === "unresolved").length;
    const day = new Date().toISOString().slice(0, 10);
    const matchesToday = matches.filter((m) => m.at.startsWith(day)).length;

    return {
      skillId: ctx.skillId,
      panel: dashboardPanelForSkillId(ctx.skillId),
      gamesPlayed: matches.length,
      wins,
      losses,
      unresolved,
      matchesToday,
      summary: null,
      matches: matches.slice().reverse(),
      logTail,
    };
  },
};
