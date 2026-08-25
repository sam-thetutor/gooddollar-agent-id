import type { BrainTool } from "../types.js";

export interface KasukuCatalogToolOptions {
  hostUrl: string;
  hostInternalSecret: string;
  fetchImpl?: typeof fetch;
}

async function catalogCall(
  options: KasukuCatalogToolOptions,
  path: string,
  init: { method: "GET" | "POST"; query?: Record<string, unknown>; body?: Record<string, unknown> },
): Promise<unknown> {
  const base = options.hostUrl.replace(/\/$/, "");
  const fetchFn = options.fetchImpl ?? fetch;
  const params = new URLSearchParams();
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
  }
  const qs = params.size > 0 ? `?${params}` : "";
  const res = await fetchFn(`${base}/internal/catalog${path}${qs}`, {
    method: init.method,
    headers: {
      "x-host-secret": options.hostInternalSecret,
      ...(init.method === "POST" ? { "content-type": "application/json" } : {}),
    },
    body: init.method === "POST" ? JSON.stringify(init.body ?? {}) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `catalog returned ${res.status}`;
    return { error: err, details: data };
  }
  return data ?? { error: `catalog returned ${res.status}` };
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function utcDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function dateArg(args: Record<string, unknown>, key: string): string | undefined {
  const raw = stringArg(args, key);
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === "today" || lower === "tonight" || lower === "now") return utcDay(0);
  if (lower === "tomorrow") return utcDay(1);
  if (lower === "yesterday") return utcDay(-1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined;
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

export function createSearchFixturesTool(options: KasukuCatalogToolOptions): BrainTool {
  return {
    name: "search_fixtures",
    description:
      "Search upcoming FOOTBALL (soccer) fixtures by team, league, and/or date range. " +
      "Football only — if the user asks about another sport, say football is the only supported sport. " +
      "Never invent matches.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Team or competition name" },
        league: { type: "string", description: "League filter, e.g. Premier League" },
        dateFrom: { type: "string", description: "YYYY-MM-DD only. Omit to default to today — never pass the word today." },
        dateTo: { type: "string", description: "YYYY-MM-DD only. Omit to default to +3 days." },
      },
    },
    async execute(args) {
      return catalogCall(options, "/fixtures", {
        method: "GET",
        query: {
          query: stringArg(args, "query"),
          league: stringArg(args, "league"),
          dateFrom: dateArg(args, "dateFrom"),
          dateTo: dateArg(args, "dateTo"),
        },
      });
    },
  };
}

export function createRecommendMatchesTool(options: KasukuCatalogToolOptions): BrainTool {
  return {
    name: "recommend_matches",
    description:
      "Rank upcoming football matches by pick confidence using real odds, form, and the model. " +
      "Use when the user asks what to bet on / safest or best games, WITHOUT building a slip yet.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "How many picks (default 5, max 10)" },
        dateFrom: { type: "string", description: "YYYY-MM-DD only. Omit to default to today — never pass the word today." },
        dateTo: { type: "string", description: "YYYY-MM-DD only. Omit to default to +3 days." },
        league: { type: "string", description: "League/competition filter" },
        market: { type: "string", description: "Normalized market, e.g. OU_2.5, BTTS, 1X2" },
        pick: { type: "string", description: "Pick side: over, under, yes, home, etc." },
      },
    },
    async execute(args) {
      return catalogCall(options, "/recommend", {
        method: "POST",
        body: {
          count: numberArg(args, "count"),
          dateFrom: dateArg(args, "dateFrom"),
          dateTo: dateArg(args, "dateTo"),
          league: stringArg(args, "league"),
          market: stringArg(args, "market"),
          pick: stringArg(args, "pick"),
        },
      });
    },
  };
}

function selectionArg(args: Record<string, unknown>): unknown[] {
  const value = args.selections;
  return Array.isArray(value) ? value : [];
}

export function createBuildBestSlipTool(options: KasukuCatalogToolOptions): BrainTool {
  return {
    name: "build_best_slip",
    description:
      "Build a football slip from the best-rated upcoming matches to hit a target odds or leg count. " +
      "Use for any 'build/make me a slip' request that does not name specific matches. " +
      "Returns legs plus bookable selections — pass those selections to book_selections " +
      "when the user wants a booking code. Do not claim a bet was placed.",
    parameters: {
      type: "object",
      properties: {
        targetOdds: { type: "number", description: 'Total odds target, e.g. 5 for "a 5 odd slip"' },
        legs: { type: "number", description: "Number of games if the user asked for a count" },
        dateFrom: { type: "string", description: "YYYY-MM-DD only. Omit to default to today — never pass the word today." },
        dateTo: { type: "string", description: "YYYY-MM-DD only. Omit to default to +3 days." },
        league: { type: "string", description: "League/competition filter" },
        market: { type: "string", description: "Normalized market filter, e.g. OU_0.5" },
        pick: { type: "string", description: "Pick side: over, under, yes, home, etc." },
      },
    },
    async execute(args) {
      return catalogCall(options, "/build-slip", {
        method: "POST",
        body: {
          targetOdds: numberArg(args, "targetOdds"),
          legs: numberArg(args, "legs"),
          dateFrom: dateArg(args, "dateFrom"),
          dateTo: dateArg(args, "dateTo"),
          league: stringArg(args, "league"),
          market: stringArg(args, "market"),
          pick: stringArg(args, "pick"),
        },
      });
    },
  };
}

export function createBookSelectionsTool(options: KasukuCatalogToolOptions): BrainTool {
  return {
    name: "book_selections",
    description:
      "Mint a real bookmaker booking code and share URL for a slip. " +
      "ONLY call this when the user explicitly asked for a code / to book. " +
      "Pass the selections array from the last build_best_slip result. " +
      "Omit bookmaker to default to Betpawa. Bookable: Betpawa, 1xBet, 22Bet, BetWinner, Helabet, Fortebet, Betika. " +
      "The user still places the stake themselves.",
    parameters: {
      type: "object",
      properties: {
        bookmaker: {
          type: "string",
          description: "Bookmaker name or id, e.g. betpawa, 1xbet. Default Betpawa.",
        },
        selections: {
          type: "array",
          description: "Legs from build_best_slip.selections — do not invent them.",
          items: { type: "object" },
        },
      },
      required: ["selections"],
    },
    async execute(args) {
      return catalogCall(options, "/book", {
        method: "POST",
        body: {
          bookmaker: stringArg(args, "bookmaker"),
          selections: selectionArg(args),
        },
      });
    },
  };
}
