import { useCallback, useEffect, useRef, useState } from "react";
import type { DeployStatusResponse } from "../client/host.js";
import { useWidget } from "../context.js";

export function useDeployDetail(deployId: string) {
  const { host, api } = useWidget();
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!deployId) {
      setStatus(null);
      hasLoadedRef.current = false;
      return null;
    }
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const next = await host.getDeployStatus(deployId);
      setStatus(next);
      hasLoadedRef.current = true;
      return next;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [deployId, host]);

  useEffect(() => {
    hasLoadedRef.current = false;
    setStatus(null);
    setError(null);
    if (!deployId) return;
    void refresh();
    const t = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(t);
  }, [deployId, refresh]);

  const verifyUrl = status?.agentAddress
    ? api.verifyAgentUrl(status.agentAddress)
    : null;

  return { status, loading, error, verifyUrl, refresh };
}
