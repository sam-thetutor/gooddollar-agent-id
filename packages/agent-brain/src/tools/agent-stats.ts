import type { BrainTool } from "../types.js";

/**
 * `agent_stats` — lets a hosted agent's brain answer questions about its own
 * live activity (match record, games today, process health) by reading the
 * host's status endpoint for its deploy. Read-only.
 */
export interface AgentStatsToolOptions {
  /** GoodAgent host origin, e.g. `http://127.0.0.1:3010`. */
  hostUrl: string;
  deployId: string;
  fetchImpl?: typeof fetch;
}

interface SkillStats {
  skillId?: string;
  panel?: string;
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  unresolved?: number;
  matchesToday?: number;
  summary?: string;
  matches?: Array<Record<string, unknown>>;
}

interface HostStatusResponse {
  displayName?: string;
  status?: string;
  agentAddress?: string;
  pm2?: { online?: boolean; uptimeMs?: number; status?: string };
  skills?: Array<{ skillId: string; status: string; stats?: SkillStats }>;
}

export function createAgentStatsTool(
  options: AgentStatsToolOptions,
): BrainTool {
  const base = options.hostUrl.replace(/\/$/, "");
  const fetchFn = options.fetchImpl ?? fetch;

  return {
    name: "agent_stats",
    description:
      "Get this agent's own live status and game statistics: per-skill games played, " +
      "wins, losses, matches today, and the most recent matches. Use whenever the user " +
      "asks about your match record, stats, today's games, or how you are doing.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const res = await fetchFn(`${base}/deploy/${options.deployId}/status`);
      if (!res.ok) {
        return { error: `host status returned ${res.status}` };
      }
      const data = (await res.json()) as HostStatusResponse;
      return {
        displayName: data.displayName,
        status: data.status,
        agentAddress: data.agentAddress,
        processOnline: data.pm2?.online ?? false,
        skills: (data.skills ?? []).map((skill) => {
          const { matches, ...stats } = skill.stats ?? {};
          return {
            skillId: skill.skillId,
            installStatus: skill.status,
            ...stats,
            recentMatches: (matches ?? []).slice(0, 3),
          };
        }),
      };
    },
  };
}
