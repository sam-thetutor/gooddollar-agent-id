import type { DeployedAgent, SkillInstall } from "@prisma/client";
import {
  buildAgentManifest,
  type AgentManifest,
  DEFAULT_PLUGIN_ENTRY,
} from "@goodagent/skill-sdk";
import { parseDeployConfiguration } from "./deployed-agents.js";

export interface BuildAgentManifestInput {
  agent: Pick<
    DeployedAgent,
    "id" | "displayName" | "agentAddress" | "configuration"
  >;
  skills: SkillInstall[];
  rpcUrl: string;
  apiBase: string;
  hostUrl: string;
  hostSecret?: string;
  /** skillId → folder name under skills/ */
  skillFolders: Record<string, string>;
  /** skillId → plugin entry relative to skill folder */
  pluginEntries?: Record<string, string>;
  /** skillId → per-skill config (falls back to deploy configuration) */
  skillConfigs?: Record<string, Record<string, string>>;
}

function skillFolderFromRegistryPath(registryPath: string): string {
  return registryPath.split("/").pop() ?? registryPath;
}

export function buildAgentManifestFromDeploy(
  input: BuildAgentManifestInput,
): AgentManifest {
  const address = input.agent.agentAddress;
  if (!address) {
    throw new Error("agentAddress is required to build manifest");
  }

  const flatConfig = parseDeployConfiguration(input.agent);
  const manifestSkills = input.skills.map((install) => {
    const folder =
      input.skillFolders[install.skillId] ??
      skillFolderFromRegistryPath(install.registryPath);
    const config =
      input.skillConfigs?.[install.skillId] ??
      parseSkillInstallConfig(install) ??
      flatConfig;
    const entry =
      input.pluginEntries?.[install.skillId] ?? DEFAULT_PLUGIN_ENTRY;

    return {
      skillId: install.skillId,
      folder,
      entry,
      config,
      enabled: install.status !== "disabled",
      apiVersion: 1 as const,
    };
  });

  return buildAgentManifest({
    deployId: input.agent.id,
    displayName: input.agent.displayName,
    agentAddress: address as `0x${string}`,
    rpcUrl: input.rpcUrl,
    apiBase: input.apiBase,
    host: {
      url: input.hostUrl.replace(/\/$/, ""),
      ...(input.hostSecret ? { secret: input.hostSecret } : {}),
    },
    skills: manifestSkills,
  });
}

function parseSkillInstallConfig(
  install: SkillInstall,
): Record<string, string> | null {
  if (!install.configJson) return null;
  try {
    const parsed = JSON.parse(install.configJson) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
