import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  formatEther,
  formatUnits,
  http,
  type Address,
} from "viem";
import { celo } from "viem/chains";
import { agentDir } from "./wallet.js";
import {
  resolveBaseline,
  writeBaseline,
  type BaselineSource,
} from "./baseline-balance.js";

export type { BaselineSource };

const G_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export interface MatchRecord {
  matchId: string;
  gameType: number;
  wagerGs: number;
  result: "won" | "lost" | "unresolved";
  mode?: "offchain" | "onchain";
  at: string;
}

export interface GamearenaState {
  day: string;
  lostTodayGs: number;
  matchesToday: number;
  history: MatchRecord[];
}

export interface AgentBalances {
  celo: string;
  celoFormatted: string;
  gDollar: string;
  gDollarFormatted: string;
}

export interface GamePerformance {
  skill: "gamearena-player" | "unknown";
  /** From deploy config when skill is gamearena-player */
  playMode?: "offchain" | "onchain";
  gamesPlayed: number;
  wins: number;
  losses: number;
  unresolved: number;
  wagerGs: number | null;
  netPnLGs: number;
  /** Net P&L from today's matches (wins − losses), UTC day */
  todayNetPnLGs: number;
  lostTodayGs: number;
  matchesToday: number;
  summary: string | null;
  /** Newest first */
  matches: MatchRecord[];
  /** @deprecated use matches — kept for compat */
  recentMatches: MatchRecord[];
}

export interface WalletPnL {
  baselineBalanceGs: number | null;
  baselineSource: BaselineSource | null;
  currentBalanceGs: number | null;
  /** current − baseline */
  walletDeltaGs: number | null;
  /** Same as netPnLGs — match ledger total */
  ledgerDeltaGs: number | null;
  /** walletDelta − ledgerDelta when both known */
  deltaMismatchGs: number | null;
}

export interface DeployStats {
  balances: AgentBalances | null;
  performance: GamePerformance | null;
  walletPnL: WalletPnL | null;
  logTail: string | null;
}

function readLogTail(path: string, lines = 8): string | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    return raw.trim().split("\n").slice(-lines).join("\n") || null;
  } catch {
    return null;
  }
}

function parseBankrollSummary(log: string | null): string | null {
  if (!log) return null;
  const lines = log.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.includes("[bankroll]")) {
      return line.replace(/.*\[bankroll\]\s*/, "").trim();
    }
  }
  return null;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayNetPnL(state: GamearenaState): number {
  const day = todayUtc();
  let net = 0;
  for (const m of state.history) {
    if (!m.at.startsWith(day)) continue;
    if (m.result === "won") net += m.wagerGs;
    if (m.result === "lost") net -= m.wagerGs;
  }
  return net;
}

function computePerformance(state: GamearenaState): Omit<GamePerformance, "skill" | "summary"> {
  const wins = state.history.filter((h) => h.result === "won");
  const losses = state.history.filter((h) => h.result === "lost");
  const unresolved = state.history.filter((h) => h.result === "unresolved");

  let netPnLGs = 0;
  for (const m of state.history) {
    if (m.result === "won") netPnLGs += m.wagerGs;
    if (m.result === "lost") netPnLGs -= m.wagerGs;
  }

  const wagerGs =
    state.history.length > 0 ? state.history[state.history.length - 1].wagerGs : null;

  const matches = state.history.slice().reverse();

  return {
    gamesPlayed: state.history.length,
    wins: wins.length,
    losses: losses.length,
    unresolved: unresolved.length,
    wagerGs,
    netPnLGs,
    todayNetPnLGs: todayNetPnL(state),
    lostTodayGs: state.lostTodayGs,
    matchesToday: state.matchesToday,
    matches,
    recentMatches: matches.slice(0, 5),
  };
}

function buildWalletPnL(opts: {
  agentsRoot: string;
  deployId: string;
  configBaselineGs?: string | null;
  currentBalanceGs: number | null;
  ledgerDeltaGs: number | null;
}): WalletPnL | null {
  if (opts.currentBalanceGs == null) return null;

  const baseline = resolveBaseline(
    opts.agentsRoot,
    opts.deployId,
    opts.configBaselineGs,
  );

  if (!baseline) {
    return {
      baselineBalanceGs: null,
      baselineSource: null,
      currentBalanceGs: opts.currentBalanceGs,
      walletDeltaGs: null,
      ledgerDeltaGs: opts.ledgerDeltaGs,
      deltaMismatchGs: null,
    };
  }

  const walletDeltaGs = opts.currentBalanceGs - baseline.balanceGs;
  const deltaMismatchGs =
    opts.ledgerDeltaGs != null
      ? Math.round((walletDeltaGs - opts.ledgerDeltaGs) * 100) / 100
      : null;

  return {
    baselineBalanceGs: baseline.balanceGs,
    baselineSource: baseline.source,
    currentBalanceGs: opts.currentBalanceGs,
    walletDeltaGs: Math.round(walletDeltaGs * 100) / 100,
    ledgerDeltaGs: opts.ledgerDeltaGs,
    deltaMismatchGs,
  };
}

export function setDeployBaselineBalance(opts: {
  agentsRoot: string;
  deployId: string;
  balanceGs: number;
}): void {
  writeBaseline(opts.agentsRoot, opts.deployId, {
    balanceGs: opts.balanceGs,
    setAt: new Date().toISOString(),
    source: "manual",
  });
}

export async function fetchAgentBalances(
  agentAddress: Address,
  rpcUrl: string,
): Promise<AgentBalances> {
  const pub = createPublicClient({ chain: celo, transport: http(rpcUrl) });
  const [celoWei, gWei] = await Promise.all([
    pub.getBalance({ address: agentAddress }),
    pub.readContract({
      address: G_DOLLAR,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [agentAddress],
    }),
  ]);
  return {
    celo: celoWei.toString(),
    celoFormatted: formatEther(celoWei),
    gDollar: gWei.toString(),
    gDollarFormatted: formatUnits(gWei, 18),
  };
}

export function readGamearenaStats(
  agentsRoot: string,
  deployId: string,
): { state: GamearenaState | null; logTail: string | null; summary: string | null } {
  const skillDir = resolve(
    agentDir(agentsRoot, deployId),
    "skills",
    "gamearena-player",
  );
  const statePath = resolve(skillDir, "state.json");
  const outLog = resolve(agentDir(agentsRoot, deployId), "logs", "out.log");

  let state: GamearenaState | null = null;
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, "utf8")) as GamearenaState;
    } catch {
      state = null;
    }
  }

  const logTail = readLogTail(outLog, 12);
  const summary = parseBankrollSummary(
    logTail ?? (existsSync(outLog) ? readFileSync(outLog, "utf8") : null),
  );

  return { state, logTail, summary };
}

function resolveGamearenaPlayMode(
  state: GamearenaState | null,
  configPlayMode?: string | null,
): "offchain" | "onchain" {
  if (configPlayMode === "onchain") return "onchain";
  if (configPlayMode === "offchain") return "offchain";
  if (state?.history.some((m) => m.mode === "onchain" || m.wagerGs > 0)) {
    return "onchain";
  }
  return "offchain";
}

export async function getDeployStats(opts: {
  agentsRoot: string;
  deployId: string;
  agentAddress: Address | null;
  skillId: string | null;
  rpcUrl: string;
  configBaselineGs?: string | null;
  playMode?: "offchain" | "onchain" | null;
}): Promise<DeployStats> {
  const balances = opts.agentAddress
    ? await fetchAgentBalances(opts.agentAddress, opts.rpcUrl).catch(() => null)
    : null;

  const currentBalanceGs = balances
    ? Number(balances.gDollarFormatted)
    : null;

  let performance: GamePerformance | null = null;
  let logTail: string | null = null;
  let ledgerDeltaGs: number | null = null;

  if (opts.skillId?.includes("gamearena")) {
    const ga = readGamearenaStats(opts.agentsRoot, opts.deployId);
    logTail = ga.logTail;
    const playMode = resolveGamearenaPlayMode(ga.state, opts.playMode ?? null);
    if (ga.state) {
      const computed = computePerformance(ga.state);
      ledgerDeltaGs = computed.netPnLGs;
      performance = {
        skill: "gamearena-player",
        playMode,
        summary: ga.summary,
        ...computed,
      };
    } else if (ga.summary) {
      performance = {
        skill: "gamearena-player",
        playMode,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        unresolved: 0,
        wagerGs: null,
        netPnLGs: 0,
        todayNetPnLGs: 0,
        lostTodayGs: 0,
        matchesToday: 0,
        summary: ga.summary,
        matches: [],
        recentMatches: [],
      };
      ledgerDeltaGs = 0;
    }
  }

  const walletPnL = buildWalletPnL({
    agentsRoot: opts.agentsRoot,
    deployId: opts.deployId,
    configBaselineGs: opts.configBaselineGs,
    currentBalanceGs:
      currentBalanceGs != null && Number.isFinite(currentBalanceGs)
        ? currentBalanceGs
        : null,
    ledgerDeltaGs,
  });

  return { balances, performance, walletPnL, logTail };
}
