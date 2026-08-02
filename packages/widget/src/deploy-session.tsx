import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GoodAgentWidgetConfig } from "./types.js";
import { MAX_DEPLOY_SKILLS } from "./lib/deploy-skills.js";

export interface DeploySessionValue {
  selectedSkillIds: string[];
  activeSkillId: string;
  setActiveSkillId: (skillId: string) => void;
  toggleSkill: (skillId: string) => void;
  ensureSkillSelection: (availableSkillIds: string[]) => void;
  marketplace: boolean;
  maxSkills: number;
}

const DeploySessionContext = createContext<DeploySessionValue | null>(null);

export function DeploySessionProvider({
  config,
  children,
}: {
  config: GoodAgentWidgetConfig;
  children: ReactNode;
}) {
  const marketplace = config.skillSelection === "marketplace";
  const initial = config.defaultSkillId ?? config.skillId;
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([initial]);
  const [activeSkillId, setActiveSkillIdState] = useState(initial);

  const setActiveSkillId = useCallback((skillId: string) => {
    setActiveSkillIdState(skillId);
  }, []);

  const toggleSkill = useCallback(
    (skillId: string) => {
      if (!marketplace) return;
      setSelectedSkillIds((prev) => {
        const has = prev.includes(skillId);
        if (has) {
          if (prev.length === 1) return prev;
          const next = prev.filter((id) => id !== skillId);
          setActiveSkillIdState((active) =>
            active === skillId ? (next[0] ?? config.skillId) : active,
          );
          return next;
        }
        if (prev.length >= MAX_DEPLOY_SKILLS) return prev;
        setActiveSkillIdState(skillId);
        return [...prev, skillId];
      });
    },
    [marketplace, config.skillId],
  );

  const ensureSkillSelection = useCallback(
    (availableSkillIds: string[]) => {
      if (!marketplace || !availableSkillIds.length) return;
      setSelectedSkillIds((prev) => {
        const valid = prev.filter((id) => availableSkillIds.includes(id));
        if (valid.length) return valid;
        const next = [availableSkillIds[0]!];
        setActiveSkillIdState(next[0]!);
        return next;
      });
    },
    [marketplace],
  );

  const value = useMemo<DeploySessionValue>(
    () => ({
      selectedSkillIds: marketplace ? selectedSkillIds : [config.skillId],
      activeSkillId: marketplace ? activeSkillId : config.skillId,
      setActiveSkillId: marketplace ? setActiveSkillId : () => undefined,
      toggleSkill,
      ensureSkillSelection,
      marketplace,
      maxSkills: MAX_DEPLOY_SKILLS,
    }),
    [
      marketplace,
      selectedSkillIds,
      activeSkillId,
      config.skillId,
      setActiveSkillId,
      toggleSkill,
      ensureSkillSelection,
    ],
  );

  return (
    <DeploySessionContext.Provider value={value}>
      {children}
    </DeploySessionContext.Provider>
  );
}

export function useDeploySession(): DeploySessionValue {
  const ctx = useContext(DeploySessionContext);
  if (!ctx) {
    throw new Error("useDeploySession must be used within DeploySessionProvider");
  }
  return ctx;
}

/** Active skill for deploy config UI. */
export function useActiveDeploySkillId(config: GoodAgentWidgetConfig): string {
  const ctx = useContext(DeploySessionContext);
  if (ctx) return ctx.activeSkillId;
  return config.skillId;
}

/** All skills selected for the next deploy. */
export function useSelectedDeploySkillIds(
  config: GoodAgentWidgetConfig,
): string[] {
  const ctx = useContext(DeploySessionContext);
  if (ctx) return ctx.selectedSkillIds;
  return [config.skillId];
}
