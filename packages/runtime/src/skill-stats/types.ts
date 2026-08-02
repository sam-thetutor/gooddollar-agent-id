import type { DashboardPanelKind } from "@goodagent/shared";
import type { MatchRecord } from "../deploy-stats.js";

export interface SkillStatsSummary {
  skillId: string;
  panel: DashboardPanelKind;
  gamesPlayed: number;
  wins: number;
  losses: number;
  unresolved: number;
  matchesToday: number;
  summary: string | null;
  /** Newest first */
  matches: MatchRecord[];
  logTail: string | null;
  /** Skill-specific extras (play mode, character, etc.) */
  meta?: Record<string, string | number | boolean | null>;
}

export interface SkillStatsContext {
  agentsRoot: string;
  deployId: string;
  skillId: string;
  registryPath: string;
  configuration: Record<string, string>;
  agentAddress: `0x${string}` | null;
  rpcUrl: string;
}

export interface SkillStatsAdapter {
  supports(skillId: string): boolean;
  collect(ctx: SkillStatsContext): Promise<SkillStatsSummary | null>;
}
