import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeConfig } from "./config.js";
import {
  gamearenaAgentApiStart,
  isGamearenaAgentApiConfigured,
} from "./gamearena-agent-api.js";
import { agentDir } from "./wallet.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface GamearenaPlayFastResult {
  matchId: string | null;
  error?: string;
}

function throwWorkerScript(): string {
  return resolve(__dirname, "gamearena-throw-worker.js");
}

/**
 * Partner play fast-path: host starts the match on GameArena, then spawns a
 * lightweight throw worker (no skill cold boot before matchId).
 */
export async function gamearenaPlayFast(
  config: RuntimeConfig,
  deployId: string,
  agentAddress: string,
): Promise<GamearenaPlayFastResult> {
  if (!isGamearenaAgentApiConfigured()) {
    return {
      matchId: null,
      error: "GAMEARENA_AGENT_API_KEY not configured",
    };
  }

  const skillDir = resolve(
    agentDir(config.agentsRoot, deployId),
    "skills/gamearena-player",
  );
  if (!existsSync(resolve(skillDir, "package.json"))) {
    return { matchId: null, error: "SKILL_NOT_INSTALLED" };
  }

  const started = await gamearenaAgentApiStart(agentAddress);
  if (!started.matchId) {
    return {
      matchId: null,
      error: started.error ?? "START_FAILED",
    };
  }

  spawnThrowWorkerDetached(started.matchId, skillDir);
  return { matchId: started.matchId };
}

/** Fire-and-forget background throws for an already-started match. */
export function spawnThrowWorkerDetached(
  matchId: string,
  skillDir: string,
): void {
  const worker = throwWorkerScript();
  const child = spawn(process.execPath, [worker, matchId, skillDir], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}
