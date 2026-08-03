import { resolveGamearenaAgentApiEnv } from "./skill-env.js";

const DEFAULT_AGENT_API_URL =
  "https://game-backend-production-6130.up.railway.app";

export interface GamearenaStartMatchResult {
  matchId: string | null;
  error?: string;
  remainingToday?: number;
  commitHash?: string;
  winsNeeded?: number;
}

export interface GamearenaThrowMoveResult {
  error?: string;
  round: number;
  playerMove: number;
  aiMove: number;
  result: "win" | "loss" | "tie";
  final?: {
    outcome: "player_won" | "ai_won" | "tie";
    totalRounds: number;
  };
}

function pickStr(
  obj: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickNum(
  obj: Record<string, unknown> | undefined,
  ...keys: string[]
): number | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function pickRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function mapFinalOutcome(
  value: unknown,
): "player_won" | "ai_won" | "tie" | undefined {
  if (value === "player_won" || value === "ai_won" || value === "tie") {
    return value;
  }
  if (typeof value !== "string") return undefined;
  const v = value.toLowerCase();
  if (v === "player_won" || v === "won" || v === "win") return "player_won";
  if (v === "ai_won" || v === "lost" || v === "loss") return "ai_won";
  if (v === "tie" || v === "draw") return "tie";
  return undefined;
}

function mapRoundResult(
  value: unknown,
): "win" | "loss" | "tie" | undefined {
  if (value === "win" || value === "loss" || value === "tie") return value;
  if (typeof value !== "string") return undefined;
  const v = value.toLowerCase();
  if (v === "win" || v === "won" || v === "player_won") return "win";
  if (v === "loss" || v === "lost" || v === "player_lost" || v === "ai_won") {
    return "loss";
  }
  if (v === "tie" || v === "draw") return "tie";
  return undefined;
}

function mapStartResult(raw: unknown): GamearenaStartMatchResult {
  if (!raw || typeof raw !== "object") {
    return { matchId: null, error: "invalid_response" };
  }
  const o = raw as Record<string, unknown>;
  const nested = pickRecord(o.data) ?? pickRecord(o.result) ?? o;
  const error =
    pickStr(o, "error", "message") ?? pickStr(nested, "error", "message");
  const matchId =
    pickStr(nested, "matchId", "match_id", "id") ??
    pickStr(o, "matchId", "match_id", "id");
  if (!matchId) {
    return { matchId: null, error: error ?? "missing_match_id" };
  }
  return {
    matchId,
    error: undefined,
    commitHash:
      pickStr(nested, "commitHash", "commit_hash", "commit") ??
      pickStr(o, "commitHash", "commit_hash", "commit"),
    winsNeeded:
      pickNum(nested, "winsNeeded", "wins_needed") ??
      pickNum(o, "winsNeeded", "wins_needed"),
    remainingToday:
      pickNum(nested, "remainingToday", "remaining_today") ??
      pickNum(o, "remainingToday", "remaining_today"),
  };
}

function mapThrowResult(raw: unknown): GamearenaThrowMoveResult {
  if (!raw || typeof raw !== "object") {
    return {
      error: "invalid_response",
      round: 0,
      playerMove: 0,
      aiMove: 0,
      result: "tie",
    };
  }
  const o = raw as Record<string, unknown>;
  const nested = pickRecord(o.data) ?? pickRecord(o.result) ?? o;
  const error =
    pickStr(o, "error", "message") ?? pickStr(nested, "error", "message");
  if (error) {
    return {
      error,
      round: pickNum(nested, "round") ?? 0,
      playerMove: pickNum(nested, "playerMove", "player_move", "move") ?? 0,
      aiMove: pickNum(nested, "aiMove", "ai_move") ?? 0,
      result: mapRoundResult(nested.result ?? o.result) ?? "tie",
    };
  }

  const finalRaw = pickRecord(nested.final) ?? pickRecord(o.final);
  const finalOutcome =
    mapFinalOutcome(finalRaw?.outcome ?? nested.outcome ?? o.outcome) ??
    (nested.done === true || o.done === true
      ? mapFinalOutcome(nested.winner ?? o.winner)
      : undefined);

  return {
    round:
      pickNum(nested, "round", "roundNumber", "round_number") ?? 0,
    playerMove:
      pickNum(nested, "playerMove", "player_move", "move") ?? 0,
    aiMove: pickNum(nested, "aiMove", "ai_move") ?? 0,
    result:
      mapRoundResult(nested.result ?? o.result) ??
      mapRoundResult(nested.roundResult ?? o.roundResult) ??
      "tie",
    final: finalOutcome
      ? {
          outcome: finalOutcome,
          totalRounds:
            pickNum(finalRaw, "totalRounds", "total_rounds") ??
            pickNum(nested, "round", "roundNumber") ??
            0,
        }
      : undefined,
  };
}

function agentApiConfig(): { baseUrl: string; apiKey: string } | null {
  const env = resolveGamearenaAgentApiEnv();
  const apiKey = env.GAMEARENA_AGENT_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl =
    env.GAMEARENA_AGENT_API_URL?.trim()?.replace(/\/$/, "") ||
    DEFAULT_AGENT_API_URL;
  return { baseUrl, apiKey };
}

export function isGamearenaAgentApiConfigured(): boolean {
  return agentApiConfig() !== null;
}

async function agentApiPost<T>(
  path: string,
  body: Record<string, unknown>,
  map: (raw: unknown) => T,
): Promise<T> {
  const cfg = agentApiConfig();
  if (!cfg) {
    return map({ error: "GAMEARENA_AGENT_API_KEY not configured" });
  }

  const url = `${cfg.baseUrl}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-agent-key": cfg.apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    return map({
      error: res.ok ? "invalid_json_response" : `HTTP ${res.status}`,
    });
  }

  if (!res.ok) {
    const o = raw as Record<string, unknown>;
    const message = pickStr(o, "error", "message") ?? `HTTP ${res.status}`;
    return map({ ...o, error: message });
  }

  return map(raw);
}

/** Host fast-path: start an off-chain MARKOV match via GameArena scoped agent API. */
export async function gamearenaAgentApiStart(
  agentAddress: string,
): Promise<GamearenaStartMatchResult> {
  return agentApiPost(
    "/api/arena/agent/start",
    { agentAddress },
    mapStartResult,
  );
}

export async function gamearenaAgentApiThrow(
  matchId: string,
  move: number,
): Promise<GamearenaThrowMoveResult> {
  return agentApiPost(
    "/api/arena/agent/throw",
    { matchId, move },
    mapThrowResult,
  );
}
