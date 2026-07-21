import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RuntimeConfig } from "./config.js";
import { agentDir } from "./wallet.js";

export interface SkillProvisionInput {
  deployId: string;
  skillDir: string;
  /** Injected into PM2 env so host PRIVATE_KEY cannot override skill .env */
  env?: Record<string, string>;
}

export function pm2ProcessName(deployId: string): string {
  return `ga-${deployId}`;
}

export function isPm2Available(): boolean {
  const r = spawnSync("pm2", ["-v"], { encoding: "utf8" });
  return r.status === 0;
}

export function writeEcosystemConfig(
  config: RuntimeConfig,
  input: SkillProvisionInput,
): string {
  const dir = agentDir(config.agentsRoot, input.deployId);
  mkdirSync(resolve(dir, "logs"), { recursive: true });

  if (!existsSync(resolve(input.skillDir, "package.json"))) {
    throw new Error(`skill package.json not found at ${input.skillDir}`);
  }

  const pm2Name = pm2ProcessName(input.deployId);
  const pm2Env = {
    NODE_ENV: "production",
    ...input.env,
  };
  const ecosystem = `module.exports = {
  apps: [{
    name: ${JSON.stringify(pm2Name)},
    cwd: ${JSON.stringify(input.skillDir)},
    script: "npm",
    args: "start",
    env: ${JSON.stringify(pm2Env, null, 2)},
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
  console.log(`[provision] wrote ${ecoPath}`);
  return ecoPath;
}

export function pm2Start(ecosystemPath: string): void {
  console.log(`[pm2] start ${ecosystemPath}`);
  execSync(`pm2 start ${JSON.stringify(ecosystemPath)}`, {
    stdio: "inherit",
    encoding: "utf8",
  });
}

export function pm2Stop(processName: string): void {
  execSync(`pm2 stop ${JSON.stringify(processName)}`, {
    stdio: "inherit",
    encoding: "utf8",
  });
}

export function pm2ReloadEcosystem(
  ecosystemPath: string,
  processName: string,
): void {
  try {
    execSync(`pm2 delete ${JSON.stringify(processName)}`, {
      stdio: "inherit",
      encoding: "utf8",
    });
  } catch {
    // not running
  }
  pm2Start(ecosystemPath);
}

export function pm2Restart(processName: string): void {
  execSync(`pm2 restart ${JSON.stringify(processName)} --update-env`, {
    stdio: "inherit",
    encoding: "utf8",
  });
}

export function pm2Delete(processName: string): void {
  try {
    execSync(`pm2 delete ${JSON.stringify(processName)}`, {
      stdio: "inherit",
      encoding: "utf8",
    });
  } catch {
    // already gone
  }
}

export function pm2Status(processName: string): string {
  try {
    return execSync(`pm2 describe ${JSON.stringify(processName)}`, {
      encoding: "utf8",
    });
  } catch {
    return "not running";
  }
}
