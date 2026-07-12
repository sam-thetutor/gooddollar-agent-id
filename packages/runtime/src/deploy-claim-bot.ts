import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { LocalAccount } from "viem/accounts";
import type { RuntimeConfig } from "./config.js";
import { getMonorepoRoot } from "./config.js";
import { fundAgentCelo, issueAgentCredential, relayAttestation } from "./identity.js";
import {
  isPm2Available,
  pm2ProcessName,
  pm2Start,
  pm2Status,
} from "./provision.js";
import {
  allocateDerivationIndex,
  deriveAgentAccount,
  writeAgentMeta,
  agentDir,
  type AgentWalletMeta,
} from "./wallet.js";

export interface DeploySpikeOptions {
  displayName: string;
  template?: "claim-bot";
  /** Skip attest + bond + issue (wallet + pm2 only). */
  skipIdentity?: boolean;
  /** Write files but do not pm2 start. */
  dryRun?: boolean;
  deployId?: string;
}

export interface DeploySpikeResult {
  deployId: string;
  agentAddress: `0x${string}`;
  derivationIndex: number;
  pm2Name: string;
  agentDir: string;
  ecosystemPath: string;
  verifyUrl?: string;
  identityIssued: boolean;
}

function newDeployId(): string {
  return randomBytes(6).toString("hex");
}

export async function deployClaimBotSpike(
  config: RuntimeConfig,
  options: DeploySpikeOptions,
): Promise<DeploySpikeResult> {
  const deployId = options.deployId ?? newDeployId();
  const template = options.template ?? "claim-bot";

  console.log(`\n=== deploy spike: ${deployId} (${template}) ===\n`);

  const index = allocateDerivationIndex(config.agentsRoot);
  const account = deriveAgentAccount(config.deployMnemonic, index);
  const agentAddress = account.address;

  console.log(`[wallet] index=${index} address=${agentAddress}`);

  const meta: AgentWalletMeta = {
    deployId,
    displayName: options.displayName,
    template,
    address: agentAddress,
    derivationIndex: index,
    createdAt: new Date().toISOString(),
  };
  const dir = writeAgentMeta(config.agentsRoot, meta);
  console.log(`[meta] ${dir}/meta.json`);

  await fundAgentCelo(config, agentAddress);

  let identityIssued = false;
  let verifyUrl: string | undefined;

  if (!options.skipIdentity) {
    await relayAttestation(config, account as LocalAccount);
    const issue = await issueAgentCredential(config, agentAddress);
    identityIssued = issue.issued;
    verifyUrl = issue.verifyUrl;
  } else {
    console.log("[identity] skipped (--skip-identity)");
  }

  const ecosystemPath = writeLegacyTelegramEcosystem(config, {
    deployId,
    displayName: options.displayName,
    agentAddress,
    template,
    telegramAppPath:
      process.env.TELEGRAM_BOT_APP_PATH ??
      resolve(getMonorepoRoot(), "apps/telegram-bot"),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  });

  const pm2Name = pm2ProcessName(deployId);

  if (options.dryRun) {
    console.log("[pm2] dry-run — not starting process");
  } else {
    if (!isPm2Available()) {
      throw new Error(
        "pm2 not found in PATH. Install: npm i -g pm2 (or run on geinz-vps).",
      );
    }
    pm2Start(ecosystemPath);
    console.log("\n[pm2] status:\n", pm2Status(pm2Name));
  }

  console.log("\n=== done ===");
  console.log(`deployId:  ${deployId}`);
  console.log(`agent:     ${agentAddress}`);
  console.log(`pm2:       ${pm2Name}`);
  console.log(`dir:       ${dir}`);
  if (verifyUrl) console.log(`verify:    ${verifyUrl}`);

  return {
    deployId,
    agentAddress,
    derivationIndex: index,
    pm2Name,
    agentDir: dir,
    ecosystemPath,
    verifyUrl,
    identityIssued,
  };
}

function writeLegacyTelegramEcosystem(
  config: RuntimeConfig,
  input: {
    deployId: string;
    displayName: string;
    agentAddress: `0x${string}`;
    template: string;
    telegramAppPath: string;
    telegramBotToken: string;
  },
): string {
  const dir = agentDir(config.agentsRoot, input.deployId);
  mkdirSync(resolve(dir, "logs"), { recursive: true });

  if (!existsSync(resolve(input.telegramAppPath, "package.json"))) {
    throw new Error(`telegram-bot package.json not found at ${input.telegramAppPath}`);
  }

  const pm2Name = pm2ProcessName(input.deployId);
  const ecosystem = `module.exports = {
  apps: [{
    name: ${JSON.stringify(pm2Name)},
    cwd: ${JSON.stringify(input.telegramAppPath)},
    script: "npm",
    args: "start",
    env: {
      NODE_ENV: "production",
      TELEGRAM_BOT_TOKEN: ${JSON.stringify(input.telegramBotToken)},
      TELEGRAM_BOT_AGENT_ADDRESS: ${JSON.stringify(input.agentAddress)},
      DISPLAY_NAME: ${JSON.stringify(input.displayName)},
    },
    autorestart: true,
    max_restarts: 10,
    min_uptime: "10s",
    error_file: ${JSON.stringify(resolve(dir, "logs/err.log"))},
    out_file: ${JSON.stringify(resolve(dir, "logs/out.log"))},
  }],
};
`;

  const ecoPath = resolve(dir, "ecosystem.config.cjs");
  writeFileSync(ecoPath, ecosystem, "utf8");
  return ecoPath;
}
