import type { Address } from "viem";
import {
  fetchGamearenaLadder,
  type GamearenaLadder,
  type LadderTopEntry,
} from "./gamearena-ladder.js";
import { readAgentMeta } from "./wallet.js";
import { GAMEARENA_SKILL_ID } from "./gamearena-pass.js";

export type { GamearenaLadder, LadderTopEntry };

/** Metadata we attach to GameArena ladder rows for GoodAgent-deployed play wallets. */
export interface GoodAgentLadderMeta {
  deployId: string;
  displayName: string;
  gamePassUsername: string | null;
  agentAddress: string;
  verified: boolean;
  skillId: string;
  source: "goodagent";
}

export interface EnrichedLadderEntry extends LadderTopEntry {
  isGoodAgent: boolean;
  goodAgent: GoodAgentLadderMeta | null;
}

export interface EnrichedGamearenaLadder extends GamearenaLadder {
  /** Wallet (lowercase) → GoodAgent metadata for ladder enrichment / filtering. */
  agentRegistry: Record<string, GoodAgentLadderMeta>;
  /** Top entries with GoodAgent flags filled in. */
  enrichedTop: EnrichedLadderEntry[];
  /** Subset of enrichedTop where isGoodAgent === true. */
  goodAgentTop: EnrichedLadderEntry[];
  /** This deploy's row on the board (may be outside top 10). */
  self?: EnrichedLadderEntry | null;
}

export function buildGoodAgentRegistry(
  agents: Array<{
    id: string;
    displayName: string;
    agentAddress: string;
    skillId: string;
    gamePassUsername?: string | null;
    verified?: boolean;
  }>,
): Record<string, GoodAgentLadderMeta> {
  const registry: Record<string, GoodAgentLadderMeta> = {};
  for (const agent of agents) {
    registry[agent.agentAddress.toLowerCase()] = {
      deployId: agent.id,
      displayName: agent.displayName,
      gamePassUsername: agent.gamePassUsername ?? null,
      agentAddress: agent.agentAddress,
      verified: agent.verified ?? false,
      skillId: agent.skillId,
      source: "goodagent",
    };
  }
  return registry;
}

export function enrichLadderEntry(
  entry: LadderTopEntry,
  registry: Record<string, GoodAgentLadderMeta>,
): EnrichedLadderEntry {
  const goodAgent = registry[entry.wallet.toLowerCase()] ?? null;
  return {
    ...entry,
    isGoodAgent: goodAgent != null,
    goodAgent,
  };
}

export function enrichGamearenaLadder(
  ladder: GamearenaLadder,
  registry: Record<string, GoodAgentLadderMeta>,
  selfWallet?: Address | null,
): EnrichedGamearenaLadder {
  const enrichedTop = ladder.top.map((entry) =>
    enrichLadderEntry(entry, registry),
  );
  const goodAgentTop = enrichedTop.filter((e) => e.isGoodAgent);

  let self: EnrichedLadderEntry | null = null;
  if (selfWallet) {
    const lower = selfWallet.toLowerCase();
    self =
      enrichedTop.find((e) => e.wallet.toLowerCase() === lower) ??
      (ladder.rank != null
        ? {
            rank: ladder.rank,
            wallet: selfWallet,
            points: ladder.points ?? 0,
            matches: ladder.matches ?? 0,
            wins: ladder.wins ?? 0,
            username:
              registry[lower]?.gamePassUsername ??
              enrichedTop.find((e) => e.wallet.toLowerCase() === lower)
                ?.username ??
              null,
            isGoodAgent: lower in registry,
            goodAgent: registry[lower] ?? null,
          }
        : null);
  }

  return {
    ...ladder,
    agentRegistry: registry,
    enrichedTop,
    goodAgentTop,
    self,
  };
}

export async function fetchEnrichedGamearenaLadder(opts: {
  wallet: Address;
  baseUrl?: string;
  registry: Record<string, GoodAgentLadderMeta>;
}): Promise<EnrichedGamearenaLadder | null> {
  const ladder = await fetchGamearenaLadder(opts.wallet, opts.baseUrl);
  if (!ladder) return null;
  return enrichGamearenaLadder(ladder, opts.registry, opts.wallet);
}

export async function buildGamearenaRegistryFromAgents(opts: {
  agentsRoot: string;
  agents: Array<{
    id: string;
    displayName: string;
    agentAddress: string;
    skillId?: string | null;
    verified?: boolean;
  }>;
}): Promise<Record<string, GoodAgentLadderMeta>> {
  const entries = opts.agents.map((agent) => {
    let gamePassUsername: string | null = null;
    try {
      const meta = readAgentMeta(opts.agentsRoot, agent.id);
      gamePassUsername = meta.gamePassUsername ?? null;
    } catch {
      // meta not written yet
    }
    return {
      id: agent.id,
      displayName: agent.displayName,
      agentAddress: agent.agentAddress,
      skillId: agent.skillId ?? GAMEARENA_SKILL_ID,
      gamePassUsername,
      verified: agent.verified ?? false,
    };
  });
  return buildGoodAgentRegistry(entries);
}
