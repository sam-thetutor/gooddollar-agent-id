import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { RuntimeConfig } from "./config.js";
import { buildLegacySkillPm2Env } from "./agent-pm2-env.js";
import {
  gamearenaSkillDir,
  isGamearenaDailyCapReached,
  loadSkillDirEnv,
  writeGamearenaPm2StartGuard,
} from "./gamearena-daily-cap.js";
import { pm2ProcessSnapshot } from "./pipeline.js";
import {
  pm2ProcessName,
  pm2Stop,
  writeEcosystemConfig,
} from "./provision.js";

export interface PauseGamearenaDailyCapResult {
  action: "paused" | "not_capped" | "already_stopped";
}

/** Stop PM2 for agents that hit today's cap; optional hook updates deploy status. */
export async function pauseGamearenaAgentAtDailyCap(
  config: RuntimeConfig,
  deployId: string,
  opts?: {
    logTail?: string | null;
    onPaused?: () => Promise<void>;
  },
): Promise<PauseGamearenaDailyCapResult> {
  if (!isGamearenaDailyCapReached(config.agentsRoot, deployId, opts?.logTail)) {
    return { action: "not_capped" };
  }

  const pm2Name = pm2ProcessName(deployId);
  const snap = pm2ProcessSnapshot(pm2Name);
  if (!snap?.online) {
    if (opts?.onPaused) await opts.onPaused();
    return { action: "already_stopped" };
  }

  try {
    pm2Stop(pm2Name);
  } catch {
    // already stopped
  }
  if (opts?.onPaused) await opts.onPaused();
  return { action: "paused" };
}

export interface PatchGamearenaDailyCapGuardsResult {
  patched: number;
  stoppedAtCap: number;
}

/** Rewrite PM2 guard + ecosystem for every hosted GameArena skill on disk. */
export function patchAllGamearenaDailyCapGuards(
  config: RuntimeConfig,
): PatchGamearenaDailyCapGuardsResult {
  let patched = 0;
  let stoppedAtCap = 0;
  const root = config.agentsRoot;
  if (!existsSync(root)) {
    return { patched, stoppedAtCap };
  }

  for (const deployId of readdirSync(root)) {
    const skillDir = gamearenaSkillDir(root, deployId);
    if (!existsSync(resolve(skillDir, "package.json"))) continue;

    writeGamearenaPm2StartGuard(skillDir);
    const skillEnv = loadSkillDirEnv(skillDir);
    writeEcosystemConfig(config, {
      deployId,
      skillDir,
      env: buildLegacySkillPm2Env(deployId, skillEnv),
      legacyOnly: true,
    });
    patched += 1;

    if (isGamearenaDailyCapReached(root, deployId)) {
      try {
        pm2Stop(pm2ProcessName(deployId));
        stoppedAtCap += 1;
      } catch {
        // ignore
      }
    }
  }

  return { patched, stoppedAtCap };
}
