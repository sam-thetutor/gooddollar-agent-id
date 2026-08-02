import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dashboardPanelForSkillId,
  isActionOrderMatchId,
  isActionOrderSkillId,
} from "@goodagent/shared";
import {
  getDeployLogTailForSkill,
  listDeployMatchesForSkill,
  type PersistedMatchRecord,
} from "@goodagent/db";
import { agentDir } from "../wallet.js";
import type { MatchRecord } from "../deploy-stats.js";
import type { SkillStatsAdapter } from "./types.js";

interface ActionOrderStateFile {
  day?: string;
  matchesToday?: number;
  history?: Array<{
    matchId: string;
    result: "won" | "lost" | "unresolved";
    at: string;
    opponent?: string;
  }>;
}

function readActionOrderState(
  agentsRoot: string,
  deployId: string,
  registryPath: string,
): ActionOrderStateFile | null {
  const folder = registryPath.split("/").pop() ?? registryPath;
  const statePath = resolve(
    agentDir(agentsRoot, deployId),
    "skills",
    folder,
    "state.json",
  );
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as ActionOrderStateFile;
  } catch {
    return null;
  }
}

function stateToMatches(state: ActionOrderStateFile): MatchRecord[] {
  return (state.history ?? [])
    .filter((m) => isActionOrderMatchId(m.matchId))
    .map((m) => ({
      matchId: m.matchId,
      gameType: 0,
      wagerGs: 0,
      result: m.result,
      mode: "offchain" as const,
      at: m.at,
    }));
}

function mergeMatches(
  persisted: PersistedMatchRecord[],
  fileHistory: MatchRecord[],
): MatchRecord[] {
  const byId = new Map<string, MatchRecord>();
  for (const rec of persisted) {
    if (isActionOrderMatchId(rec.matchId)) byId.set(rec.matchId, rec);
  }
  for (const rec of fileHistory) {
    byId.set(rec.matchId, rec);
  }
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}

export const actionOrderSkillStatsAdapter: SkillStatsAdapter = {
  supports: (skillId) => isActionOrderSkillId(skillId),
  async collect(ctx) {
    const [persisted, logTail, fileState] = await Promise.all([
      listDeployMatchesForSkill(ctx.deployId, ctx.skillId, { includeLegacy: false }),
      getDeployLogTailForSkill(ctx.deployId, ctx.skillId, 24),
      Promise.resolve(
        readActionOrderState(ctx.agentsRoot, ctx.deployId, ctx.registryPath),
      ),
    ]);

    const fileMatches = fileState ? stateToMatches(fileState) : [];
    const merged = mergeMatches(persisted, fileMatches);

    const wins = merged.filter((m) => m.result === "won").length;
    const losses = merged.filter((m) => m.result === "lost").length;
    const unresolved = merged.filter((m) => m.result === "unresolved").length;
    const day = new Date().toISOString().slice(0, 10);
    const matchesToday =
      fileState?.day === day
        ? (fileState.matchesToday ?? merged.filter((m) => m.at.startsWith(day)).length)
        : merged.filter((m) => m.at.startsWith(day)).length;

    return {
      skillId: ctx.skillId,
      panel: dashboardPanelForSkillId(ctx.skillId),
      gamesPlayed: merged.length,
      wins,
      losses,
      unresolved,
      matchesToday,
      summary: merged.length
        ? `${wins}W / ${losses}L · ${ctx.configuration.CHARACTER_ID ?? "riven"} vs house`
        : null,
      matches: merged.slice().reverse(),
      logTail,
      meta: {
        character: ctx.configuration.CHARACTER_ID ?? "riven",
        strategy: ctx.configuration.STRATEGY ?? "anti_strike",
        difficulty: ctx.configuration.DIFFICULTY ?? "0",
      },
    };
  },
};
