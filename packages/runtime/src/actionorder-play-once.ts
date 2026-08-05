import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RuntimeConfig } from "./config.js";
import { agentDir } from "./wallet.js";

const MATCH_LINE = /\[match (AO-[^\]]+)\]/;
const DEFAULT_START_TIMEOUT_MS = 90_000;

function parseDotEnv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function loadSkillEnv(skillDir: string): Record<string, string> {
  const envPath = resolve(skillDir, ".env");
  if (!existsSync(envPath)) return {};
  try {
    return parseDotEnv(readFileSync(envPath, "utf8"));
  } catch {
    return {};
  }
}

function logTail(output: string, lines = 40): string | undefined {
  const tail = output.trim().split("\n").slice(-lines).join("\n");
  return tail || undefined;
}

function findMatchId(output: string): string | null {
  const match = MATCH_LINE.exec(output);
  return match?.[1] ?? null;
}

export function actionorderSkillDir(
  agentsRoot: string,
  deployId: string,
): string {
  return resolve(agentDir(agentsRoot, deployId), "skills/actionorder-player");
}

export interface PlayActionOrderMatchOnceResult {
  matchId: string | null;
  exitCode: number | null;
  error?: string;
  logTail?: string;
}

/**
 * Run one vs-house match for a hosted deploy (partner "play now").
 * Spawns actionorder-player with MAX_MATCHES=1 and returns when match id appears.
 */
export function playActionOrderMatchOnce(
  config: RuntimeConfig,
  deployId: string,
  displayName: string,
  opts?: { startTimeoutMs?: number; actionOrderUrl?: string },
): Promise<PlayActionOrderMatchOnceResult> {
  const skillDir = actionorderSkillDir(config.agentsRoot, deployId);
  if (!existsSync(resolve(skillDir, "package.json"))) {
    return Promise.resolve({
      matchId: null,
      exitCode: null,
      error: "SKILL_NOT_INSTALLED",
    });
  }

  const baseEnv = loadSkillEnv(skillDir);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...baseEnv,
    MAX_MATCHES: "1",
    MATCH_INTERVAL_SECONDS: "1",
    STARTUP_JITTER_SECONDS: "0",
    AGENT_DISPLAY_NAME: displayName,
    DEPLOY_ID: deployId,
    ...(opts?.actionOrderUrl
      ? { ACTIONORDER_URL: opts.actionOrderUrl.replace(/\/$/, "") }
      : {}),
  };

  const startTimeoutMs = opts?.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;

  return new Promise((resolvePromise) => {
    let output = "";
    let settled = false;

    const finish = (result: PlayActionOrderMatchOnceResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };

    const child = spawn("npm", ["start"], {
      cwd: skillDir,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onChunk = (chunk: Buffer | string) => {
      output += chunk.toString();
      const matchId = findMatchId(output);
      if (matchId) {
        child.unref();
        finish({ matchId, exitCode: null, logTail: logTail(output) });
      }
    };

    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);

    child.on("error", (err) => {
      finish({
        matchId: findMatchId(output),
        exitCode: null,
        error: err.message,
        logTail: logTail(output),
      });
    });

    child.on("exit", (code) => {
      const matchId = findMatchId(output);
      if (matchId) {
        finish({ matchId, exitCode: code, logTail: logTail(output) });
        return;
      }
      finish({
        matchId: null,
        exitCode: code,
        error: code === 0 ? "MATCH_NOT_STARTED" : "PLAY_FAILED",
        logTail: logTail(output),
      });
    });

    const timer = setTimeout(() => {
      const matchId = findMatchId(output);
      child.unref();
      if (matchId) {
        finish({ matchId, exitCode: null, logTail: logTail(output) });
        return;
      }
      finish({
        matchId: null,
        exitCode: null,
        error: "START_TIMEOUT",
        logTail: logTail(output),
      });
    }, startTimeoutMs);
  });
}
