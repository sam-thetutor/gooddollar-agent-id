import type { DeployAgent } from "../client/host.js";
import { GAMEARENA_SKILL_ID } from "../skill-config.js";

export function isGamearenaDeploy(agent: DeployAgent): boolean {
  return (
    agent.skills?.some((s) => s.skillId === GAMEARENA_SKILL_ID) ??
    false
  );
}

/** Oldest GameArena deploy for an owner (matches host partner API). */
export function firstGamearenaDeployForOwner(
  agents: DeployAgent[],
): DeployAgent | null {
  const gamearena = agents.filter(isGamearenaDeploy);
  if (!gamearena.length) return null;

  return [...gamearena].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  })[0]!;
}

/** When GameArena competition mode is on, expose only the first deploy. */
export function filterToFirstGamearenaDeploy(
  agents: DeployAgent[],
  enabled: boolean,
): DeployAgent[] {
  if (!enabled) return agents;
  const first = firstGamearenaDeployForOwner(agents);
  return first ? [first] : [];
}
