import { randomInt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gamearenaAgentApiThrow } from "./gamearena-agent-api.js";

const MOVE_NAMES = ["rock", "paper", "scissors"] as const;

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRpsToken(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (t === "rock" || t === "r" || t === "0") return 0;
  if (t === "paper" || t === "p" || t === "1") return 1;
  if (t === "scissors" || t === "s" || t === "2") return 2;
  return null;
}

interface Strategy {
  nextMove(lastAiMove?: number): number;
}

function createStrategy(env: Record<string, string>): Strategy {
  const id = (env.MARKOV_STRATEGY ?? "random").toLowerCase();
  if (id === "fixed") {
    const move =
      parseRpsToken(env.RPS_FIXED ?? "rock") ??
      parseRpsToken(env.RPS_SEQUENCE?.split(",")[0] ?? "") ??
      0;
    return { nextMove: () => move };
  }
  if (id === "sequence") {
    const moves = (env.RPS_SEQUENCE ?? "rock,paper,scissors")
      .split(",")
      .map((t) => parseRpsToken(t))
      .filter((m): m is number => m !== null);
    const seq = moves.length > 0 ? moves : [0, 1, 2];
    let i = 0;
    return {
      nextMove: () => {
        const move = seq[i % seq.length]!;
        i += 1;
        return move;
      },
    };
  }
  if (id === "counter") {
    return {
      nextMove: (lastAiMove) =>
        typeof lastAiMove === "number" ? (lastAiMove + 1) % 3 : randomInt(3),
    };
  }
  return { nextMove: () => randomInt(3) };
}

/** Play one started match to completion (background worker). */
export async function runGamearenaThrowWorker(
  matchId: string,
  skillDir: string,
): Promise<void> {
  const env = loadSkillEnv(skillDir);
  const roundPaceMs = Math.max(
    0,
    Number(env.ROUND_PACE_MS ?? process.env.ROUND_PACE_MS ?? 1000),
  );
  const strategy = createStrategy(env);
  let lastAiMove: number | undefined;

  console.log(`[throws] match ${matchId} · strategy ${env.MARKOV_STRATEGY ?? "random"}`);

  while (true) {
    const move = strategy.nextMove(lastAiMove);
    const round = await gamearenaAgentApiThrow(matchId, move);

    if (round.error) {
      console.error(`[throws] match ${matchId} error: ${round.error}`);
      break;
    }

    if (typeof round.aiMove === "number") {
      lastAiMove = round.aiMove;
    }

    const label = MOVE_NAMES[move] ?? String(move);
    console.log(
      `[throws] match ${matchId} r${round.round}: ${label} vs ${round.aiMove} → ${round.result}`,
    );

    if (round.final) {
      console.log(
        `[throws] match ${matchId} done · ${round.final.outcome} in ${round.final.totalRounds} rounds`,
      );
      break;
    }

    if (roundPaceMs > 0) {
      await sleep(roundPaceMs);
    }
  }
}

async function main(): Promise<void> {
  const matchId = process.argv[2]?.trim();
  const skillDir = process.argv[3]?.trim();
  if (!matchId || !skillDir) {
    console.error("usage: gamearena-throw-worker <matchId> <skillDir>");
    process.exit(1);
  }
  await runGamearenaThrowWorker(matchId, skillDir);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error("[throws] fatal:", err);
    process.exit(1);
  });
}
