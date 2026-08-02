import { z } from "zod";
import { SKILL_API_VERSION } from "./types.js";

const hexAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "expected checksummed or lowercase 0x address");

export const agentManifestSkillSchema = z.object({
  skillId: z.string().min(1),
  folder: z.string().min(1),
  entry: z.string().min(1).default("dist/plugin.js"),
  config: z.record(z.string()).default({}),
  enabled: z.boolean().default(true),
  apiVersion: z.literal(SKILL_API_VERSION).default(SKILL_API_VERSION),
});

export const agentManifestSchema = z.object({
  version: z.literal(1),
  deployId: z.string().min(1),
  displayName: z.string().min(1),
  agentAddress: hexAddress,
  rpcUrl: z.string().url(),
  apiBase: z.string().url(),
  host: z.object({
    url: z.string().url(),
    secret: z.string().optional(),
  }),
  skills: z.array(agentManifestSkillSchema).min(1),
});

export type AgentManifestSkill = z.infer<typeof agentManifestSkillSchema>;
export type AgentManifest = z.infer<typeof agentManifestSchema>;

export function parseAgentManifest(raw: unknown): AgentManifest {
  return agentManifestSchema.parse(raw);
}

export function buildAgentManifest(
  input: Omit<AgentManifest, "version"> & { version?: 1 },
): AgentManifest {
  return agentManifestSchema.parse({ version: 1, ...input });
}
