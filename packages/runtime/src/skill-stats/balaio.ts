import { dashboardPanelForSkillId, isBalaioSkillId } from "@goodagent/shared";
import {
  getDeployLogTailForSkill,
  listDeployMatchesForSkill,
} from "@goodagent/db";
import type { SkillStatsAdapter } from "./types.js";

export const balaioSkillStatsAdapter: SkillStatsAdapter = {
  supports: (skillId) => isBalaioSkillId(skillId),
  async collect(ctx) {
    const [matches, logTail] = await Promise.all([
      listDeployMatchesForSkill(ctx.deployId, ctx.skillId, { includeLegacy: false }),
      getDeployLogTailForSkill(ctx.deployId, ctx.skillId, 16),
    ]);

    const wins = matches.filter((m) => m.result === "won").length;
    const losses = matches.filter((m) => m.result === "lost").length;
    const day = new Date().toISOString().slice(0, 10);

    return {
      skillId: ctx.skillId,
      panel: dashboardPanelForSkillId(ctx.skillId),
      gamesPlayed: matches.length,
      wins,
      losses,
      unresolved: matches.filter((m) => m.result === "unresolved").length,
      matchesToday: matches.filter((m) => m.at.startsWith(day)).length,
      summary: ctx.configuration.CREATE_TASK_ID
        ? `Task ${ctx.configuration.CREATE_TASK_ID}`
        : null,
      matches: matches.slice().reverse(),
      logTail,
      meta: {
        roles: ctx.configuration.BALAIO_ROLES ?? "",
        taskId: ctx.configuration.CREATE_TASK_ID ?? "",
      },
    };
  },
};
