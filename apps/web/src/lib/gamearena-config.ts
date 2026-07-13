import { parseSkillConfig } from "./skill-config.js";

export type GamearenaPlayMode = "offchain" | "onchain";

export const GAMEARENA_SKILL_ID = "gaming/wagering/gamearena_1v1";

export function parsePlayMode(
  config: Record<string, string> = {},
): GamearenaPlayMode {
  return config.PLAY_MODE === "onchain" ? "onchain" : "offchain";
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
    return { label: "Free tickets · optional G$", variant: "ok" };
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
