import type { RegistrySkillWithDashboard } from "@goodagent/shared";
import { resolveSkillStatsAdapter } from "./registry.js";
import type { SkillStatsContext, SkillStatsSummary } from "./types.js";

export { resolveSkillStatsAdapter } from "./registry.js";

export async function collectSkillStats(
  ctx: SkillStatsContext,
  registryEntry?: Pick<RegistrySkillWithDashboard, "skill_id" | "dashboard">,
): Promise<SkillStatsSummary | null> {
  const adapter = resolveSkillStatsAdapter(ctx.skillId, registryEntry);
  return adapter.collect(ctx);
}

export async function collectDeploySkillStats(
  opts: {
    agentsRoot: string;
    deployId: string;
    agentAddress: `0x${string}` | null;
    rpcUrl: string;
    skills: Array<{
      skillId: string;
      registryPath: string;
      status: string;
      configuration: Record<string, string>;
    }>;
    registryEntries?: Record<string, Pick<RegistrySkillWithDashboard, "skill_id" | "dashboard">>;
  },
): Promise<Record<string, SkillStatsSummary>> {
  const enabled = opts.skills.filter((s) => s.status !== "disabled");
  const entries = await Promise.all(
    enabled.map(async (skill) => {
      const stats = await collectSkillStats(
        {
          agentsRoot: opts.agentsRoot,
          deployId: opts.deployId,
          skillId: skill.skillId,
          registryPath: skill.registryPath,
          configuration: skill.configuration,
          agentAddress: opts.agentAddress,
          rpcUrl: opts.rpcUrl,
        },
        opts.registryEntries?.[skill.skillId],
      );
      return [skill.skillId, stats] as const;
    }),
  );

  const out: Record<string, SkillStatsSummary> = {};
  for (const [skillId, stats] of entries) {
    if (stats) out[skillId] = stats;
  }
  return out;
}

export type { SkillStatsAdapter, SkillStatsContext, SkillStatsSummary } from "./types.js";
