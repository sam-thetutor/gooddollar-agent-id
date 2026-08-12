import { execSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { RuntimeConfig } from "./config.js";
import {
  GAMEARENA_DAILY_CAP_EXIT_CODE,
  isGamearenaSkillDir,
  writeGamearenaPm2StartGuard,
} from "./gamearena-daily-cap.js";
import { agentDir } from "./wallet.js";

export interface BrainEcosystemApp {
  pm2Name: string;
  cwd: string;
  cliPath: string;
  manifestPath: string;
  env: Record<string, string>;
  logDir: string;
}

export interface SkillProvisionInput {
  deployId: string;
  skillDir: string;
  /** Injected into PM2 env so host PRIVATE_KEY cannot override skill .env */
  env?: Record<string, string>;
  /** Force legacy npm/skill PM2 even when RUNTIME_V1=1 (GameArena guard patches). */
  legacyOnly?: boolean;
  /** Option C: single agent-runtime process loading plugins from manifest.json */
  runtimeV1?: {
    manifestPath: string;
    runtimeCli: string;
  };
  /** Optional LLM brain companion process (ga-brain-<id>). */
  brain?: BrainEcosystemApp;
}

export function isRuntimeV1Enabled(): boolean {
  return process.env.RUNTIME_V1 === "1";
}

export function resolveAgentRuntimeCli(): string {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("@goodagent/agent-runtime");
  const cli = resolve(dirname(entry), "cli.js");
  if (!existsSync(cli)) {
    throw new Error(
      "@goodagent/agent-runtime dist/cli.js not found — run pnpm build",
    );
  }
  return cli;
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

  const useRuntimeV1 =
    !input.legacyOnly && Boolean(input.runtimeV1 ?? isRuntimeV1Enabled());
  if (!useRuntimeV1 && !existsSync(resolve(input.skillDir, "package.json"))) {
    throw new Error(`skill package.json not found at ${input.skillDir}`);
  }
  if (useRuntimeV1) {
    const manifestPath = input.runtimeV1?.manifestPath ?? resolve(dir, "manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`manifest.json not found at ${manifestPath}`);
    }
  }

  const pm2Name = pm2ProcessName(input.deployId);
  const pm2Env = {
    NODE_ENV: "production",
    ...input.env,
  };

  const gamearenaGuard =
    !useRuntimeV1 && isGamearenaSkillDir(input.skillDir)
      ? writeGamearenaPm2StartGuard(input.skillDir)
      : null;

  const brainApp = input.brain ? buildBrainApp(input.brain) : "";

  const ecosystem = useRuntimeV1
    ? buildRuntimeV1Ecosystem({
        pm2Name,
        agentDir: dir,
        manifestPath: input.runtimeV1?.manifestPath ?? resolve(dir, "manifest.json"),
        runtimeCli: input.runtimeV1?.runtimeCli ?? resolveAgentRuntimeCli(),
        pm2Env,
        brainApp,
      })
    : buildLegacySkillEcosystem({
        pm2Name,
        skillDir: input.skillDir,
        pm2Env,
        logDir: resolve(dir, "logs"),
        startScript: gamearenaGuard?.startScript,
        stopExitCodes: gamearenaGuard
          ? [GAMEARENA_DAILY_CAP_EXIT_CODE]
          : undefined,
        brainApp,
      });

  const ecoPath = resolve(dir, "ecosystem.config.cjs");
  writeFileSync(ecoPath, ecosystem, "utf8");
  console.log(`[provision] wrote ${ecoPath}${useRuntimeV1 ? " (runtime v1)" : ""}`);
  return ecoPath;
}

/** Second PM2 app running @goodagent/agent-brain against brain-manifest.json. */
function buildBrainApp(brain: BrainEcosystemApp): string {
  return `, {
    name: ${JSON.stringify(brain.pm2Name)},
    cwd: ${JSON.stringify(brain.cwd)},
    script: "node",
    args: ${JSON.stringify([brain.cliPath, "--manifest", brain.manifestPath])},
    env: ${JSON.stringify(brain.env, null, 2)},
    autorestart: true,
    max_restarts: 10,
    min_uptime: "10s",
    error_file: ${JSON.stringify(resolve(brain.logDir, "brain-err.log"))},
    out_file: ${JSON.stringify(resolve(brain.logDir, "brain-out.log"))},
  }`;
}

function buildLegacySkillEcosystem(opts: {
  pm2Name: string;
  skillDir: string;
  pm2Env: Record<string, string>;
  logDir: string;
  startScript?: string;
  stopExitCodes?: number[];
  brainApp?: string;
}): string {
  const script = opts.startScript
    ? JSON.stringify(opts.startScript)
    : JSON.stringify("npm");
  const args = opts.startScript ? JSON.stringify("") : JSON.stringify("start");
  const interpreter = opts.startScript
    ? `\n    interpreter: "bash",`
    : "";
  const stopExitCodes =
    opts.stopExitCodes?.length ?
      `\n    stop_exit_codes: ${JSON.stringify(opts.stopExitCodes)},`
    : "";

  return `module.exports = {
  apps: [{
    name: ${JSON.stringify(opts.pm2Name)},
    cwd: ${JSON.stringify(opts.skillDir)},
    script: ${script},
    args: ${args},${interpreter}
    env: ${JSON.stringify(opts.pm2Env, null, 2)},
    autorestart: true,
    max_restarts: 10,
    min_uptime: "10s",${stopExitCodes}
    error_file: ${JSON.stringify(resolve(opts.logDir, "err.log"))},
    out_file: ${JSON.stringify(resolve(opts.logDir, "out.log"))},
  }${opts.brainApp ?? ""}],
};
`;
}

function buildRuntimeV1Ecosystem(opts: {
  pm2Name: string;
  agentDir: string;
  manifestPath: string;
  runtimeCli: string;
  pm2Env: Record<string, string>;
  brainApp?: string;
}): string {
  return `module.exports = {
  apps: [{
    name: ${JSON.stringify(opts.pm2Name)},
    cwd: ${JSON.stringify(opts.agentDir)},
    script: "node",
    args: ${JSON.stringify([opts.runtimeCli, "--manifest", opts.manifestPath])},
    env: ${JSON.stringify(opts.pm2Env, null, 2)},
    autorestart: true,
    max_restarts: 10,
    min_uptime: "10s",
    error_file: ${JSON.stringify(resolve(opts.agentDir, "logs/err.log"))},
    out_file: ${JSON.stringify(resolve(opts.agentDir, "logs/out.log"))},
  }${opts.brainApp ?? ""}],
};
`;
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
