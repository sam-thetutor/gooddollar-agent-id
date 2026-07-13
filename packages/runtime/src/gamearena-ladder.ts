import type { Address } from "viem";

const CHALLENGE_ACTIONS = ["getArenaLadder"] as const;
type LadderAction = (typeof CHALLENGE_ACTIONS)[number];

const ACTION_RE =
  /createServerReference\)\("([a-f0-9]+)"[^"]*"([^"]+)"\)/g;

export interface LadderTopEntry {
  rank: number;
  wallet: string;
  points: number;
  matches: number;
  wins: number;
  username: string | null;
}

export interface GamearenaLadder {
  rank: number | null;
  points: number | null;
  wins: number | null;
  matches: number | null;
  remainingToday: number | null;
  top: LadderTopEntry[];
  error: string | null;
}

interface RawLadderResult {
  remainingToday?: number;
  top?: Array<{
    wallet: string;
    points: number;
    matches: number;
    wins: number;
    rank: number;
    username: string | null;
  }>;
  me?: { rank?: number; points?: number; wins?: number; matches?: number };
  error?: string;
}

type ActionMap = Partial<Record<LadderAction, string>>;

let actionCache: { at: number; pageUrl: string; actions: ActionMap } | null =
  null;
const ACTION_CACHE_MS = 5 * 60 * 1000;

function originFromBase(baseUrl: string): string {
  return new URL(baseUrl).origin;
}

function parseFlightPayload(text: string): unknown {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("1:"));
  if (!line) {
    throw new Error("Unexpected GameArena response");
  }
  return JSON.parse(line.slice(2)) as unknown;
}

async function discoverLadderAction(
  pageUrl: string,
  origin: string,
): Promise<string> {
  if (
    actionCache &&
    actionCache.pageUrl === pageUrl &&
    Date.now() - actionCache.at < ACTION_CACHE_MS &&
    actionCache.actions.getArenaLadder
  ) {
    return actionCache.actions.getArenaLadder;
  }

  const pageRes = await fetch(pageUrl, { headers: { Accept: "text/html" } });
  if (!pageRes.ok) {
    throw new Error(`GameArena page fetch failed (${pageRes.status})`);
  }

  const html = await pageRes.text();
  const chunkPaths = [
    ...new Set(
      [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map(
        (m) => m[1],
      ),
    ),
  ];

  const actions: ActionMap = {};
  await Promise.all(
    chunkPaths.map(async (path) => {
      try {
        const res = await fetch(`${origin}${path}`);
        if (!res.ok) return;
        const js = await res.text();
        let match: RegExpExecArray | null;
        ACTION_RE.lastIndex = 0;
        while ((match = ACTION_RE.exec(js)) !== null) {
          const [, hash, name] = match;
          if (name === "getArenaLadder") {
            actions.getArenaLadder = hash;
          }
        }
      } catch {
        // skip bad chunks
      }
    }),
  );

  if (!actions.getArenaLadder) {
    throw new Error("getArenaLadder action not found in GameArena bundles");
  }

  actionCache = { at: Date.now(), pageUrl, actions };
  return actions.getArenaLadder;
}

export async function fetchGamearenaLadder(
  wallet: Address,
  baseUrl = "https://gamearenahq.xyz",
): Promise<GamearenaLadder | null> {
  try {
    const origin = originFromBase(baseUrl);
    const pageUrl = `${origin}/games/challenge-ai`;
    const actionId = await discoverLadderAction(pageUrl, origin);

    const res = await fetch(pageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        Origin: origin,
        Referer: pageUrl,
        "Next-Action": actionId,
      },
      body: JSON.stringify([wallet]),
    });

    if (!res.ok) {
      return {
        rank: null,
        points: null,
        wins: null,
        matches: null,
        remainingToday: null,
        top: [],
        error: `HTTP ${res.status}`,
      };
    }

    const raw = parseFlightPayload(await res.text()) as RawLadderResult;
    if (raw.error) {
      return {
        rank: null,
        points: null,
        wins: null,
        matches: null,
        remainingToday: raw.remainingToday ?? null,
        top: [],
        error: raw.error,
      };
    }

    const top = (raw.top ?? []).map((e) => ({
      rank: e.rank,
      wallet: e.wallet,
      points: e.points,
      matches: e.matches,
      wins: e.wins,
      username: e.username,
    }));

    const meRow = top.find(
      (e) => e.wallet.toLowerCase() === wallet.toLowerCase(),
    );

    return {
      rank: raw.me?.rank ?? meRow?.rank ?? null,
      points: raw.me?.points ?? meRow?.points ?? null,
      wins: raw.me?.wins ?? meRow?.wins ?? null,
      matches: raw.me?.matches ?? meRow?.matches ?? null,
      remainingToday: raw.remainingToday ?? null,
      top: top.slice(0, 10),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      rank: null,
      points: null,
      wins: null,
      matches: null,
      remainingToday: null,
      top: [],
      error: message,
    };
  }
}
