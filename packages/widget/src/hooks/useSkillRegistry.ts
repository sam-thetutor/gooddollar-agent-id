import { useCallback, useEffect, useState } from "react";
import {
  fetchSkillRegistry,
  listDeployableSkills,
  type RegistrySkillEntry,
} from "../skill-registry.js";

export function useSkillRegistry(
  registryUrl: string,
  allowedSkillIds?: string[],
) {
  const [skills, setSkills] = useState<RegistrySkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const registry = await fetchSkillRegistry(registryUrl);
      let list = listDeployableSkills(registry);
      if (allowedSkillIds?.length) {
        const allow = new Set(allowedSkillIds);
        list = list.filter((s) => allow.has(s.skill_id));
      }
      setSkills(list);
      return list;
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      setSkills([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [registryUrl, allowedSkillIds]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { skills, loading, error, refresh };
}
