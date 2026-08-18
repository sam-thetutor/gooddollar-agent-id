/**
 * One-shot: re-provision the ACTION-ORDER deploy through the real pipeline
 * with the new brain support (validates the whole deploy-pipeline path).
 *
 * Mirrors host scheduleDeployPipeline, but runs locally on the VPS so we do
 * not need an owner wallet signature. Run from packages/runtime:
 *
 *   pnpm exec tsx scripts/reprovision-actionorder-brain.mts
 */
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import {
  getDeployedAgent,
  maxWalletDerivationIndex,
  resolveSkillConfiguration,
  updateDeployedAgent,
  updateSkillInstall,
} from "@goodagent/db";
import {
  getRuntimeConfig,
  loadRuntimeEnv,
  runDeployPipeline,
} from "../src/index.js";

const DEPLOY_ID = process.env.DEPLOY_ID?.trim() || "cmsadg4zq0000dtsldarirvih";
const BOT_TOKEN = process.env.BRAIN_BOT_TOKEN?.trim() || "";
const MODEL =
  process.env.BRAIN_MODEL_OVERRIDE?.trim() ||
  "9e8f9aaee684298b7f2af2ae008e3692f0e9f4f7@deepseek-v4-flash";
const TOOLS = ["verify_address", "check_claim_eligibility", "agent_stats"];

// Same construction as packages/db/src/crypto.ts (not exported from the index).
function encryptSecret(plaintext: string, secret: string): string {
  const key = scryptSync(secret, "goodagent-deploy-v1", 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

loadRuntimeEnv();
const config = getRuntimeConfig();
const encryptionSecret = process.env.ENCRYPTION_SECRET?.trim();
if (!BOT_TOKEN) throw new Error("BRAIN_BOT_TOKEN env required");
if (!encryptionSecret) throw new Error("ENCRYPTION_SECRET not set");

const agent = await getDeployedAgent(DEPLOY_ID);
if (!agent) throw new Error(`deploy not found: ${DEPLOY_ID}`);
if (!agent.ownerWallet) throw new Error("ownerWallet not set");
if (!agent.agentAddress || agent.walletDerivationIndex == null) {
  throw new Error("deploy has no provisioned wallet to resume");
}

const brainConfig = { enabled: true, model: MODEL, tools: TOOLS };
await updateDeployedAgent(DEPLOY_ID, {
  brainConfig: JSON.stringify(brainConfig),
  brainBotTokenEnc: encryptSecret(BOT_TOKEN, encryptionSecret),
});
console.log("[reprovision] brain config persisted");

const previousStatus = agent.status;
const result = await runDeployPipeline(
  config,
  {
    deployId: DEPLOY_ID,
    displayName: agent.displayName,
    ownerWallet: agent.ownerWallet as `0x${string}`,
    template: agent.template,
    skills: agent.skills.map((install) => ({
      skillId: install.skillId,
      registryPath: install.registryPath,
      configuration: resolveSkillConfiguration(agent, install),
      installId: install.id,
    })),
    telegramBotToken: null,
    brain: { model: MODEL, tools: TOOLS, botToken: BOT_TOKEN },
    minDerivationIndex: await maxWalletDerivationIndex(),
    resume: {
      agentAddress: agent.agentAddress as `0x${string}`,
      walletDerivationIndex: agent.walletDerivationIndex,
    },
  },
  {
    onStatus: async (status, fields) => {
      console.log(`[reprovision] status → ${status}`);
      await updateDeployedAgent(DEPLOY_ID, { status, ...fields });
    },
    onSkillInstalled: async ({ skillId, configuration }) => {
      await updateSkillInstall(DEPLOY_ID, skillId, {
        status: "installed",
        configJson: JSON.stringify(configuration),
        activatedAt: new Date(),
        lastError: null,
      });
    },
  },
);

console.log("[reprovision] pipeline done", {
  ecosystemPath: result.ecosystemPath,
  brainBotUsername: result.brainBotUsername,
});

await updateDeployedAgent(DEPLOY_ID, {
  brainConfig: JSON.stringify({
    ...brainConfig,
    botUsername: result.brainBotUsername ?? undefined,
  }),
  // Agent is already vouched + live; restore prior status.
  status: previousStatus === "running" ? "running" : previousStatus,
});
console.log("[reprovision] status restored:", previousStatus);
