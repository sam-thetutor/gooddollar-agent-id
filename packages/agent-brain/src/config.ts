import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { GOODAGENT_API_URL } from "@goodagent/shared";

/**
 * Brain configuration. The manifest carries the per-agent `brain` block from
 * the architecture doc; env vars carry secrets and deploy-level endpoints.
 *
 * Inference endpoint resolution (first match wins):
 * 1. BRAIN_LLM_BASE_URL / OPENAI_BASE_URL env
 * 2. GD_ANTSEED_WORKER_URL + `/v1` (Worker chat proxy, when live)
 * 3. http://localhost:8377/v1 (raw AntSeed buyer proxy — dev only)
 */
export const brainManifestSchema = z.object({
  model: z.string().min(1).optional(),
  channels: z.array(z.enum(["telegram"])).default([]),
  persona: z.string().optional(),
  knowledge: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
});

export const brainManifestFileSchema = z.object({
  deployId: z.string().optional(),
  displayName: z.string().optional(),
  brain: brainManifestSchema,
});

export type BrainManifest = z.infer<typeof brainManifestSchema>;

export interface BrainConfig {
  llmBaseUrl: string;
  llmApiKey?: string;
  model: string;
  apiBase: string;
  /** GoodAgent host origin + deploy id — required for the `agent_stats` tool. */
  hostUrl?: string;
  deployId?: string;
  workerUrl?: string;
  telegramBotToken?: string;
  channels: string[];
  personaPath?: string;
  knowledgePaths: string[];
  toolNames: string[];
  /** Directory for session persistence (memory/sessions under agent dir). */
  memoryDir?: string;
}

export const DEFAULT_DEV_LLM_BASE_URL = "http://localhost:8377/v1";
export const DEFAULT_MODEL = "deepseek-v4-flash";

export function loadBrainConfig(
  env: NodeJS.ProcessEnv = process.env,
  manifestPath?: string,
): BrainConfig {
  let manifest: BrainManifest = brainManifestSchema.parse({});
  let manifestDir = process.cwd();
  let manifestDeployId: string | undefined;

  if (manifestPath) {
    const abs = resolve(manifestPath);
    if (!existsSync(abs)) {
      throw new Error(`brain manifest not found: ${abs}`);
    }
    const parsed = brainManifestFileSchema.parse(
      JSON.parse(readFileSync(abs, "utf8")),
    );
    manifest = parsed.brain;
    manifestDeployId = parsed.deployId;
    manifestDir = dirname(abs);
  }

  const workerUrl = env.GD_ANTSEED_WORKER_URL?.trim() || undefined;
  const llmBaseUrl =
    env.BRAIN_LLM_BASE_URL?.trim() ||
    env.OPENAI_BASE_URL?.trim() ||
    (workerUrl ? `${workerUrl.replace(/\/$/, "")}/v1` : DEFAULT_DEV_LLM_BASE_URL);

  const resolveFromManifest = (p: string) => resolve(manifestDir, p);

  return {
    llmBaseUrl,
    llmApiKey: env.BRAIN_LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || undefined,
    model: env.BRAIN_MODEL?.trim() || manifest.model || DEFAULT_MODEL,
    apiBase: env.API_BASE?.trim() || GOODAGENT_API_URL,
    hostUrl: env.GOODAGENT_HOST_URL?.trim() || undefined,
    deployId: env.DEPLOY_ID?.trim() || manifestDeployId,
    workerUrl,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    channels: manifest.channels,
    personaPath: manifest.persona ? resolveFromManifest(manifest.persona) : undefined,
    knowledgePaths: manifest.knowledge.map(resolveFromManifest),
    toolNames:
      manifest.tools.length > 0
        ? manifest.tools
        : ["verify_address", "check_claim_eligibility"],
    memoryDir: env.BRAIN_MEMORY_DIR?.trim() || resolve(manifestDir, "memory/sessions"),
  };
}
