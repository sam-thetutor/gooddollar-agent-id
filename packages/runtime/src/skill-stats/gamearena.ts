import {
  buildGamearenaState,
  readGamearenaStats,
} from "../deploy-stats.js";
import { GAMEARENA_SKILL_ID } from "../gamearena-pass.js";
import { dashboardPanelForSkillId, isGamearenaSkillId, matchBelongsToSkill } from "@goodagent/shared";
import { listDeployMatchesForSkill } from "@goodagent/db";
import type { SkillStatsAdapter } from "./types.js";

export const gamearenaSkillStatsAdapter: SkillStatsAdapter = {
  supports: (skillId) => isGamearenaSkillId(skillId),
  async collect(ctx) {
    const ga = readGamearenaStats(ctx.agentsRoot, ctx.deployId);
    const persisted = await listDeployMatchesForSkill(ctx.deployId, ctx.skillId, {
      includeLegacy: true,
    });
    const mergedState = buildGamearenaState({
      fileState: ga.state,
      persistedMatches: persisted,
    });

    const playMode =
      ctx.configuration.PLAY_MODE === "onchain"
        ? "onchain"
        : ctx.configuration.PLAY_MODE === "auto"
          ? "auto"
          : "offchain";

    if (!mergedState) {
      return {
        skillId: ctx.skillId,
        panel: dashboardPanelForSkillId(ctx.skillId),
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        unresolved: 0,
        matchesToday: 0,
        summary: ga.summary,
        matches: [],
        logTail: ga.logTail,
        meta: { playMode },
      };
    }

    const scopedHistory = mergedState.history.filter((m) =>
      matchBelongsToSkill(ctx.skillId, m.matchId),
    );
    const scopedWins = scopedHistory.filter((m) => m.result === "won").length;
    const scopedLosses = scopedHistory.filter((m) => m.result === "lost").length;
    const scopedUnresolved = scopedHistory.filter(
      (m) => m.result === "unresolved",
    ).length;
    const matches = scopedHistory.slice().reverse();

    return {
      skillId: ctx.skillId,
      panel: dashboardPanelForSkillId(ctx.skillId),
      gamesPlayed: scopedHistory.length,
      wins: scopedWins,
      losses: scopedLosses,
      unresolved: scopedUnresolved,
      matchesToday: mergedState.matchesToday,
      summary: ga.summary,
      matches,
      logTail: ga.logTail,
      meta: { playMode },
    };
  },
};

export { GAMEARENA_SKILL_ID };
