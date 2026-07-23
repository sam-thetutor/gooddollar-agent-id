import type { DeployAgent } from "../client/host.js";
import { skillShortLabel } from "../skill-config.js";

export function shortenAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function statusTone(status: string, online?: boolean): "ok" | "warn" | "error" | "muted" {
  if (online || status === "running") return "ok";
  if (status === "awaiting_vouch" || status === "starting" || status === "provisioning") {
    return "warn";
  }
  if (status === "failed") return "error";
  return "muted";
}

export function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function skillIdForDeploy(agent: DeployAgent): string | null {
  return agent.skills?.[0]?.skillId ?? null;
}

export function skillLabelForDeploy(agent: DeployAgent): string {
  const skillId = skillIdForDeploy(agent);
  return skillId ? skillShortLabel(skillId) : "Agent";
}

export function parseConfigSummary(raw?: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function configHighlights(
  skillId: string | null | undefined,
  config: Record<string, string>,
): string[] {
  if (!skillId) return [];
  if (skillId.includes("gamearena")) {
    const bits = [
      config.PLAY_MODE ? `${config.PLAY_MODE} play` : null,
      config.MARKOV_STRATEGY ? `${config.MARKOV_STRATEGY} strategy` : null,
      config.MAX_MATCHES ? `${config.MAX_MATCHES} max matches` : null,
      config.MATCH_INTERVAL_SECONDS
        ? `${config.MATCH_INTERVAL_SECONDS}s interval`
        : null,
    ];
    return bits.filter(Boolean) as string[];
  }
  if (skillId.includes("balaio")) {
    return [
      config.ENABLE_WORKER === "1" ? "worker on" : null,
      config.SCAN_INTERVAL_SECONDS
        ? `scan every ${config.SCAN_INTERVAL_SECONDS}s`
        : null,
    ].filter(Boolean) as string[];
  }
  return Object.entries(config)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`);
}

export const GOODAGENT_SITE = "https://goodagentids.xyz";

export function exploreAgentUrl(agentAddress: string): string {
  return `${GOODAGENT_SITE}/explore/agent/${agentAddress}`;
}

export function celoscanUrl(address: string): string {
  return `https://celoscan.io/address/${address}`;
}
