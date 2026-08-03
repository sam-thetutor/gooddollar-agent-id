import { useCallback, useEffect, useState } from "react";
import { useWidget } from "../context.js";
import { parseFvCallback, startGoodDollarFaceVerification } from "../gooddollar.js";

/** GoodDollar whitelist / face-verify status for the connected owner wallet. */
export function useOwnerIdentity() {
  const { wallet, api, config, rpcUrl } = useWidget();
  const [identity, setIdentity] = useState<{
    verified: boolean;
    root: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet.address) {
      setIdentity(null);
      setLoading(false);
      return;
    }
    setError(false);
    setLoading(true);
    try {
      const d = await api.getWalletOverview(wallet.address);
      setIdentity({
        verified: d.verify.isWhitelisted,
        root: d.verify.root,
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [wallet.address, api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fv = parseFvCallback(new URLSearchParams(window.location.search));
    if (fv?.isVerified) void refresh();
  }, [refresh]);

  const verifyFv = useCallback(async () => {
    if (!wallet.address) {
      setVerifyError("Connect your wallet first.");
      return;
    }
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      await startGoodDollarFaceVerification(wallet, config, rpcUrl);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not start verification.";
      setVerifyError(message);
    } finally {
      setVerifyBusy(false);
    }
  }, [wallet, config, rpcUrl]);

  return {
    identity,
    loading,
    error,
    verified: Boolean(identity?.verified),
    verifyBusy,
    verifyError,
    refresh,
    verifyFv,
  };
}
