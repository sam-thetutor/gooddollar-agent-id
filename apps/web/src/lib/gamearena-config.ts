import { parseSkillConfig } from "./skill-config.js";

export type GamearenaPlayMode = "offchain" | "onchain" | "auto";

export type MarkovStrategyId = "random" | "sequence" | "fixed" | "counter";

export const GAMEARENA_SKILL_ID = "gaming/wagering/gamearena_1v1";

export const MARKOV_STRATEGIES: {
  id: MarkovStrategyId;
  label: string;
  hint?: string;
}[] = [
  { id: "random", label: "Random", hint: "Unpredictable — best vs MARKOV's predictor" },
  { id: "sequence", label: "Sequence", hint: "Cycle rock → paper → scissors" },
  { id: "fixed", label: "Fixed", hint: "Always throw the same move" },
  {
    id: "counter",
    label: "Counter last",
    hint: "Beat MARKOV's previous throw (off-chain rounds only)",
  },
];

export function parsePlayMode(
  config: Record<string, string> = {},
): GamearenaPlayMode {
  const mode = config.PLAY_MODE?.trim().toLowerCase();
  if (mode === "onchain" || mode === "auto") return mode;
  return "offchain";
}

export function parseMarkovStrategy(
  config: Record<string, string> = {},
): MarkovStrategyId {
  const id = config.MARKOV_STRATEGY?.trim().toLowerCase();
  if (id === "sequence" || id === "fixed" || id === "counter") return id;
  return "random";
}

export function isGamearenaSkill(skillId?: string | null): boolean {
  return skillId === GAMEARENA_SKILL_ID;
}

export function isGamearenaOffchain(
  skillId?: string | null,
  config: Record<string, string> = {},
): boolean {
  return isGamearenaSkill(skillId) && parsePlayMode(config) === "offchain";
}

export function playModeLabel(mode: GamearenaPlayMode | null): string {
  if (mode === "onchain") return "On-chain wagers";
  if (mode === "auto") return "Auto (tickets → on-chain)";
  return "Off-chain tickets";
}

export function strategyLabelFromConfig(
  config: Record<string, string> = {},
): string {
  const id = parseMarkovStrategy(config);
  if (id === "sequence") {
    return `Sequence (${config.RPS_SEQUENCE ?? "rock,paper,scissors"})`;
  }
  if (id === "fixed") {
    return `Fixed (${config.RPS_FIXED ?? "rock"})`;
  }
  if (id === "counter") return "Counter last";
  return "Random";
}

export function playModeFromDeploy(
  skillId?: string | null,
  configuration?: string | null,
): GamearenaPlayMode | null {
  if (!isGamearenaSkill(skillId)) return null;
  return parsePlayMode(parseSkillConfig(configuration));
}

export interface SkillPermPill {
  label: string;
  variant: "warn" | "ok";
}

export function skillSpendPill(skill: {
  skill_id: string;
  spends_tokens: boolean;
  token?: string;
  modes?: string[];
}): SkillPermPill {
  if (skill.skill_id === GAMEARENA_SKILL_ID) {
    return { label: "G$ ticket refills · capped", variant: "warn" };
  }
  if (skill.spends_tokens) {
    return {
      label: `Spends ${skill.token ?? "G$"} · capped`,
      variant: "warn",
    };
  }
  if (skill.skill_id.includes("actionorder")) {
    return { label: "Free vs-house", variant: "ok" };
  }
  return { label: "No wager", variant: "ok" };
}
