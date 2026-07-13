import { useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { startGoodDollarFaceVerification } from "../lib/gooddollar-identity.js";

type Props = {
  className?: string;
  label?: string;
  busyLabel?: string;
};

export function GoodDollarVerifyButton({
  className = "btn btn-primary",
  label = "Verify with GoodDollar",
  busyLabel = "Preparing verification…",
}: Props) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (!publicClient || !walletClient) {
      setError("Connect your wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startGoodDollarFaceVerification(publicClient, walletClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => void handleClick()}
      >
        {busy ? busyLabel : label}
      </button>
      {error && <p className="error small hint">{error}</p>}
    </>
  );
}
