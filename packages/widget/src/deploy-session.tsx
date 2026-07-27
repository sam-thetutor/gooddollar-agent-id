import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GoodAgentWidgetConfig } from "./types.js";

export interface DeploySessionValue {
  selectedSkillId: string;
  setSelectedSkillId: (skillId: string) => void;
  marketplace: boolean;
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
  const initial =
    config.defaultSkillId ?? config.skillId;
  const [selectedSkillId, setSelectedSkillIdState] = useState(initial);

  const setSelectedSkillId = useCallback(
    (skillId: string) => {
      if (!marketplace) return;
      setSelectedSkillIdState(skillId);
    },
    [marketplace],
  );

  const value = useMemo<DeploySessionValue>(
    () => ({
      selectedSkillId: marketplace ? selectedSkillId : config.skillId,
      setSelectedSkillId,
      marketplace,
    }),
    [
      marketplace,
      selectedSkillId,
      config.skillId,
      setSelectedSkillId,
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

/** Active skill for deploy — works inside or outside DeploySessionProvider. */
export function useActiveDeploySkillId(config: GoodAgentWidgetConfig): string {
  const ctx = useContext(DeploySessionContext);
  if (ctx) return ctx.selectedSkillId;
  return config.skillId;
}
