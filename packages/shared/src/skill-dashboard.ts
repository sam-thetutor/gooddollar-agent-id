import type { DashboardPanelKind } from "./deploy-skills.js";
import {
  dashboardPanelForSkillId,
  isActionOrderSkillId,
  isBalaioSkillId,
  isGamearenaSkillId,
  isPlaychessifySkillId,
  isUbiSkillId,
} from "./deploy-skills.js";
import type { RegistrySkillFlags } from "./skill-registry.js";

/** Registry v2 optional dashboard block (see goodagent-skills registry.json). */
export interface RegistrySkillDashboard {
  /** Panel kind for dashboard tab content */
  dashboardPanel?: DashboardPanelKind;
  /** Stats adapter key in host/runtime (defaults from skill_id) */
  statsAdapter?: RegistryStatsAdapterKey;
}

export type RegistryStatsAdapterKey =
  | "gamearena"
  | "actionorder"
  | "playchessify"
  | "balaio"
  | "ubi"
  | "generic";

export type RegistrySkillWithDashboard = RegistrySkillFlags & {
  skill_id: string;
  dashboard?: RegistrySkillDashboard;
};

export function statsAdapterKeyForSkillId(skillId: string): RegistryStatsAdapterKey {
  if (isGamearenaSkillId(skillId)) return "gamearena";
  if (isActionOrderSkillId(skillId)) return "actionorder";
  if (isPlaychessifySkillId(skillId)) return "playchessify";
  if (isBalaioSkillId(skillId)) return "balaio";
  if (isUbiSkillId(skillId)) return "ubi";
  return "generic";
}

export function dashboardPanelForRegistrySkill(
  skill: Pick<RegistrySkillWithDashboard, "skill_id" | "dashboard">,
): DashboardPanelKind {
  return skill.dashboard?.dashboardPanel ?? dashboardPanelForSkillId(skill.skill_id);
}

export function statsAdapterKeyForRegistrySkill(
  skill: Pick<RegistrySkillWithDashboard, "skill_id" | "dashboard">,
): RegistryStatsAdapterKey {
  return skill.dashboard?.statsAdapter ?? statsAdapterKeyForSkillId(skill.skill_id);
}

/** Portable skill stats shape returned by host status API. */
export interface SkillStatsView {
  skillId: string;
  panel: DashboardPanelKind;
  gamesPlayed: number;
  wins: number;
  losses: number;
  unresolved: number;
  matchesToday: number;
  summary: string | null;
  matches: Array<{
    matchId: string;
    gameType?: number;
    wagerGs: number;
    result: "won" | "lost" | "unresolved";
    mode?: "offchain" | "onchain";
    at: string;
  }>;
  logTail: string | null;
  meta?: Record<string, string | number | boolean | null>;
}
