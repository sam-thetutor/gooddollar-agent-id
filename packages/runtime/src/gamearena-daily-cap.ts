import { writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentDir } from "./wallet.js";

/** PM2 stop_exit_codes — skill/guard exits with this when daily cap is reached. */
export const GAMEARENA_DAILY_CAP_EXIT_CODE = 75;

const DAILY_CAP_LOG_RE =
  /daily match cap:\s*played\s+\d+\s+of\s+\d+\s+matches today/i;

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

export function utcDayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function gamearenaSkillDir(
  agentsRoot: string,
  deployId: string,
): string {
  return resolve(agentDir(agentsRoot, deployId), "skills/gamearena-player");
}

export function isGamearenaSkillDir(skillDir: string): boolean {
  return skillDir.replace(/\\/g, "/").includes("/skills/gamearena-player");
}

export function loadSkillDirEnv(skillDir: string): Record<string, string> {
  const envPath = resolve(skillDir, ".env");
  if (!existsSync(envPath)) return {};
  try {
    return parseDotEnv(readFileSync(envPath, "utf8"));
  } catch {
    return {};
  }
}

export function readDailyMatchCap(skillDir: string): number {
  const env = loadSkillDirEnv(skillDir);
  const parsed = Number.parseInt(env.DAILY_MATCH_CAP ?? "50", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

export function readGamearenaDailyCapState(skillDir: string): {
  day: string;
  matchesToday: number;
} | null {
  const statePath = resolve(skillDir, "state.json");
  if (!existsSync(statePath)) return null;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      day?: string;
      matchesToday?: number;
    };
    if (!state.day || typeof state.matchesToday !== "number") return null;
    return { day: state.day, matchesToday: state.matchesToday };
  } catch {
    return null;
  }
}

export function detectDailyCapFromLog(logTail: string | null | undefined): boolean {
  if (!logTail) return false;
  return DAILY_CAP_LOG_RE.test(logTail);
}

/** True when today's persisted state shows the agent hit its configured daily cap. */
export function isGamearenaDailyCapReached(
  agentsRoot: string,
  deployId: string,
  logTail?: string | null,
): boolean {
  const skillDir = gamearenaSkillDir(agentsRoot, deployId);
  if (!existsSync(resolve(skillDir, "package.json"))) return false;

  const state = readGamearenaDailyCapState(skillDir);
  if (state) {
    const cap = readDailyMatchCap(skillDir);
    if (state.day === utcDayString() && state.matchesToday >= cap) {
      return true;
    }
  }

  return detectDailyCapFromLog(logTail);
}

const PM2_START_CHECK = String.raw`#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EXIT_DAILY_CAP = ${GAMEARENA_DAILY_CAP_EXIT_CODE};
const skillDir = dirname(fileURLToPath(import.meta.url));

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function parseDotEnv(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[trimmed.slice(0, eq).trim()] = value;
  }
  return vars;
}

function dailyCap() {
  const envPath = resolve(skillDir, ".env");
  const env = existsSync(envPath)
    ? parseDotEnv(readFileSync(envPath, "utf8"))
    : {};
  const parsed = Number.parseInt(env.DAILY_MATCH_CAP ?? "50", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

function capReached() {
  const statePath = resolve(skillDir, "state.json");
  if (!existsSync(statePath)) return false;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (state.day !== utcDay()) return false;
    return Number(state.matchesToday) >= dailyCap();
  } catch {
    return false;
  }
}

if (capReached()) {
  // Plain concatenation: backticks cannot be emitted cleanly through String.raw.
  console.log(
    "[pm2-start] daily match cap reached (" + dailyCap() + "/day) — staying stopped until tomorrow",
  );
  process.exit(EXIT_DAILY_CAP);
}
`;

const PM2_START_SH = String.raw`#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
node "$DIR/pm2-start-check.mjs"
exec npm start
`;

/** Writes guard scripts that block PM2 restart after the daily cap is hit. */
export function writeGamearenaPm2StartGuard(skillDir: string): {
  startScript: string;
  checkScript: string;
} {
  const checkScript = resolve(skillDir, "pm2-start-check.mjs");
  const startScript = resolve(skillDir, "pm2-start.sh");
  writeFileSync(checkScript, PM2_START_CHECK, "utf8");
  writeFileSync(startScript, PM2_START_SH, "utf8");
  chmodSync(startScript, 0o755);
  return { startScript, checkScript };
}
