import { SKILL_API_VERSION } from "./types.js";

/** Registry v2 runtime block (goodagent-skills/registry.json). */
export interface RegistrySkillRuntimeV2 {
  /** Relative path inside the skill package, default dist/plugin.js */
  entry?: string;
  /** Plugin API version the skill was built against */
  apiVersion?: typeof SKILL_API_VERSION;
}

export interface RegistrySkillCapabilitiesV2 {
  spendsTokens?: boolean;
  requiresTelegram?: boolean;
  requiresPrivateKey?: boolean;
}

export interface RegistrySkillCompatibilityV2 {
  minRuntimeVersion?: string;
  chains?: string[];
}

/** Optional v2 extensions on top of base registry skill entries. */
export interface RegistrySkillV2Extensions {
  runtime?: RegistrySkillRuntimeV2;
  capabilities?: RegistrySkillCapabilitiesV2;
  compatibility?: RegistrySkillCompatibilityV2;
}

export const DEFAULT_PLUGIN_ENTRY = "dist/plugin.js";

export function resolvePluginEntry(
  runtime?: RegistrySkillRuntimeV2 | null,
): string {
  return runtime?.entry?.trim() || DEFAULT_PLUGIN_ENTRY;
}

export function resolvePluginApiVersion(
  runtime?: RegistrySkillRuntimeV2 | null,
): typeof SKILL_API_VERSION {
  return runtime?.apiVersion ?? SKILL_API_VERSION;
}
