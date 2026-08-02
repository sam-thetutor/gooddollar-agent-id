import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { RuntimeConfig } from "./config.js";
import { agentDir } from "./wallet.js";

const START_LINE = /\[start\] match (\S+)/;

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

export interface PlayGamearenaMatchOnceResult {
  matchId: string | null;
  exitCode: number | null;
  error?: string;
  logTail?: string;
}

/**
 * Run one off-chain MARKOV match for a hosted deploy (partner "play now").
 * Uses the installed skill package with MAX_MATCHES=1 overrides.
 */
export function playGamearenaMatchOnce(
  config: RuntimeConfig,
  deployId: string,
  displayName: string,
): PlayGamearenaMatchOnceResult {
  const skillDir = resolve(
    agentDir(config.agentsRoot, deployId),
    "skills/gamearena-player",
  );
  if (!existsSync(resolve(skillDir, "package.json"))) {
    return {
      matchId: null,
      exitCode: null,
      error: "SKILL_NOT_INSTALLED",
    };
  }

  const baseEnv = loadSkillEnv(skillDir);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...baseEnv,
    MAX_MATCHES: "1",
    MATCH_INTERVAL_SECONDS: "1",
    AGENT_DISPLAY_NAME: displayName,
    DEPLOY_ID: deployId,
  };

  const run = spawnSync("npm", ["start"], {
    cwd: skillDir,
    env,
    encoding: "utf8",
    timeout: 180_000,
  });

  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  const match = START_LINE.exec(output);
  const logTail = output.trim().split("\n").slice(-40).join("\n") || undefined;

  if (run.error) {
    return {
      matchId: match?.[1] ?? null,
      exitCode: run.status,
      error: run.error.message,
      logTail,
    };
  }

  if (!match?.[1]) {
    return {
      matchId: null,
      exitCode: run.status,
      error: run.status === 0 ? "MATCH_NOT_STARTED" : "PLAY_FAILED",
      logTail,
    };
  }

  return {
    matchId: match[1],
    exitCode: run.status,
    logTail,
  };
}
