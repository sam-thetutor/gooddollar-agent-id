import type { HostClient, SkillActivityEvent } from "@goodagent/skill-sdk";

export function createSkillScopedHostClient(
  base: HostClient,
  skillId: string,
): HostClient {
  return {
    heartbeat: () => base.heartbeat(),
    reportActivity: (event: SkillActivityEvent) =>
      base.reportActivity({ ...event, skillId: event.skillId ?? skillId }),
  };
}
