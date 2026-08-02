#!/usr/bin/env node
/** Re-install skill files + PM2 for a deploy that exists in DB but missing on disk. */
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import {
  getDeployedAgent,
  maxWalletDerivationIndex,
  resolveSkillConfiguration,
  skillFolderFromRegistryPath,
  updateDeployedAgent,
  updateSkillInstall,
} from "@goodagent/db";
import {
  getRuntimeConfig,
  loadRuntimeEnv,
  runDeployPipeline,
  startDeployedAgent,
  agentDir,
} from "../src/index.js";

const deployId = process.argv[2]?.trim();
if (!deployId) {
  console.error("Usage: reprovision-deploy.mts <deployId>");
  process.exit(1);
}

loadEnv({ path: resolve(process.cwd(), ".env"), override: true });
loadRuntimeEnv();

async function main() {
  const agent = await getDeployedAgent(deployId);
  if (!agent) throw new Error(`deploy not found: ${deployId}`);
  if (!agent.ownerWallet) throw new Error("OWNER_NOT_SET");
  if (!agent.agentAddress || agent.walletDerivationIndex == null) {
    throw new Error("agent not provisioned in DB — run full deploy pipeline first");
  }
  if (!agent.skills.length) throw new Error("NO_SKILLS");

  const config = getRuntimeConfig();
  console.log(`[reprovision] deploy=${deployId} agentsRoot=${config.agentsRoot}`);

  await runDeployPipeline(
    config,
    {
      deployId,
      displayName: agent.displayName,
      ownerWallet: agent.ownerWallet as `0x${string}`,
      template: agent.template,
      skills: agent.skills.map((install) => ({
        skillId: install.skillId,
        registryPath: install.registryPath,
        configuration: resolveSkillConfiguration(agent, install),
        installId: install.id,
      })),
      skipIdentity: false,
      minDerivationIndex: await maxWalletDerivationIndex(),
      resume: {
        agentAddress: agent.agentAddress as `0x${string}`,
        walletDerivationIndex: agent.walletDerivationIndex,
      },
    },
    {
      onStatus: async (status, fields) => {
        await updateDeployedAgent(deployId, { status, ...fields });
        console.log(`[reprovision] status=${status}`);
      },
      onSkillInstalled: async ({ skillId, configuration }) => {
        await updateSkillInstall(deployId, skillId, {
          status: "installed",
          configJson: JSON.stringify(configuration),
          activatedAt: new Date(),
          lastError: null,
        });
        console.log(`[reprovision] skill installed ${skillId}`);
      },
    },
  );

  for (const install of agent.skills) {
    const folder = skillFolderFromRegistryPath(install.registryPath);
    const skillDir = resolve(
      agentDir(config.agentsRoot, deployId),
      "skills",
      folder,
    );
    if (!existsSync(resolve(skillDir, "package.json"))) {
      throw new Error(`skill files missing after pipeline: ${skillDir}`);
    }
  }

  startDeployedAgent(config, deployId);
  await updateDeployedAgent(deployId, {
    status: "running",
    lastError: null,
    deployedAt: agent.deployedAt ?? new Date(),
  });

  console.log(`[reprovision] ok deploy=${deployId} agent=${agent.agentAddress}`);
}

main().catch((err) => {
  console.error("[reprovision] failed:", err);
  process.exit(1);
});
