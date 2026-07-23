import { useCallback, useEffect, useRef, useState } from "react";
import type { DeployAgent } from "../client/host.js";
import { useWidget } from "../context.js";

export function useOwnerDeploys(ownerWallet: string | undefined) {
  const { host } = useWidget();
  const [agents, setAgents] = useState<DeployAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!ownerWallet) {
      setAgents([]);
      setLoading(false);
      hasLoadedRef.current = false;
      return [];
    }

    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const { agents: list } = await host.listByOwner(ownerWallet);
      setAgents(list);
      hasLoadedRef.current = true;
      return list;
    } catch (e) {
      setError((e as Error).message);
      if (!hasLoadedRef.current) setAgents([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [host, ownerWallet]);

  useEffect(() => {
    hasLoadedRef.current = false;
    setAgents([]);
    setLoading(Boolean(ownerWallet));
    setError(null);
  }, [ownerWallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { agents, loading, error, refresh };
}
