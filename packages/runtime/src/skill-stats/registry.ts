import {
  statsAdapterKeyForRegistrySkill,
  type RegistryStatsAdapterKey,
  type RegistrySkillWithDashboard,
} from "@goodagent/shared";
import { actionOrderSkillStatsAdapter } from "./actionorder.js";
import { balaioSkillStatsAdapter } from "./balaio.js";
import { gamearenaSkillStatsAdapter } from "./gamearena.js";
import { genericSkillStatsAdapter } from "./generic.js";
import { ubiSkillStatsAdapter } from "./ubi.js";
import { productClankSkillStatsAdapter } from "./productclank.js";
import type { SkillStatsAdapter } from "./types.js";

const BY_KEY: Record<RegistryStatsAdapterKey, SkillStatsAdapter> = {
  gamearena: gamearenaSkillStatsAdapter,
  actionorder: actionOrderSkillStatsAdapter,
  balaio: balaioSkillStatsAdapter,
  ubi: ubiSkillStatsAdapter,
  productclank: productClankSkillStatsAdapter,
  generic: genericSkillStatsAdapter,
};

const ADAPTERS: SkillStatsAdapter[] = [
  gamearenaSkillStatsAdapter,
  actionOrderSkillStatsAdapter,
  balaioSkillStatsAdapter,
  ubiSkillStatsAdapter,
  productClankSkillStatsAdapter,
  genericSkillStatsAdapter,
];

export function resolveSkillStatsAdapter(
  skillId: string,
  registryEntry?: Pick<RegistrySkillWithDashboard, "skill_id" | "dashboard">,
): SkillStatsAdapter {
  if (registryEntry) {
    const key = statsAdapterKeyForRegistrySkill(registryEntry);
    return BY_KEY[key] ?? genericSkillStatsAdapter;
  }
  return ADAPTERS.find((a) => a.supports(skillId)) ?? genericSkillStatsAdapter;
}
