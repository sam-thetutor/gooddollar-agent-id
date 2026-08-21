import type { Address } from "viem";
import { buildHostReportEnv } from "./skill-env.js";
import { resolveAgentPrivateKey } from "./wallet.js";
import type { RuntimeConfig } from "./config.js";
import { BALAIO_WORKER_SKILL_ID } from "./skill-env.js";
import { GAMEARENA_SKILL_ID } from "./gamearena-pass.js";

export interface AgentPm2SkillRow {
  skillId: string;
  status?: string;
}

function skillNeedsPrivateKey(skillId: string): boolean {
  if (skillId === BALAIO_WORKER_SKILL_ID) return true;
  if (skillId === GAMEARENA_SKILL_ID) return true;
  if (skillId.includes("actionorder")) return true;
  return false;
}

/** Agent-level PM2 env for runtime v1 — manifest carries per-skill config. */
export function buildAgentPm2Env(
  config: RuntimeConfig,
  deployId: string,
  skills: AgentPm2SkillRow[],
  agentAddress: Address,
  walletDerivationIndex: number,
): Record<string, string> {
  const hostReportEnv = buildHostReportEnv(deployId);
  const enabledSkills = skills.filter((s) => s.status !== "disabled");
  const needsKey = enabledSkills.some((s) => skillNeedsPrivateKey(s.skillId));

  const env: Record<string, string> = {
    NODE_ENV: "production",
    ...hostReportEnv,
    DEPLOY_ID: deployId,
    AGENT_ADDRESS: agentAddress,
  };

  if (needsKey) {
    const agentPrivateKey = resolveAgentPrivateKey(
      config,
      deployId,
      walletDerivationIndex,
    );
    env.AGENT_PRIVATE_KEY = agentPrivateKey;
    env.PRIVATE_KEY = agentPrivateKey;
  }

  return env;
}

export function buildLegacySkillPm2Env(
  deployId: string,
  skillEnv: Record<string, string>,
): Record<string, string> {
  const hostReportEnv = buildHostReportEnv(deployId);
  return {
    ...skillEnv,
    ...hostReportEnv,
    ...(skillEnv.PRIVATE_KEY ? { AGENT_PRIVATE_KEY: skillEnv.PRIVATE_KEY } : {}),
  };
}
