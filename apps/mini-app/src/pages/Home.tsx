import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { CELO_ID } from "../lib/wagmi.js";
import { UBI_SCHEME_ADDRESS, ubiClaimAbi } from "../lib/contracts.js";
import { getWalletOverview, type WalletOverview } from "../lib/api.js";
import { isMiniPay } from "../lib/telegram.js";

type OverviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: WalletOverview }
  | { kind: "error"; message: string };

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatG(amount: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const miniPay = useMemo(() => isMiniPay(), []);
  const injectedConnector = useMemo(
    () => connectors.find((c) => c.id === "injected"),
    [connectors],
  );
  const autoConnectAttempted = useRef(false);
  const onWrongChain = isConnected && chainId !== CELO_ID;

  const [overview, setOverview] = useState<OverviewState>({ kind: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    writeContract,
    data: claimHash,
    isPending: claimPending,
    error: claimError,
    reset: resetClaim,
  } = useWriteContract();
  const { isLoading: claimConfirming, isSuccess: claimConfirmed } =
    useWaitForTransactionReceipt({ hash: claimHash });

  // MiniPay: auto-connect on load (injected provider, no button).
  useEffect(() => {
    if (!miniPay || isConnected || autoConnectAttempted.current) return;
    if (!injectedConnector) return;
    autoConnectAttempted.current = true;
    connect({ connector: injectedConnector });
  }, [miniPay, isConnected, injectedConnector, connect]);

  // Load on-chain overview whenever we have a connected wallet on Celo.
  useEffect(() => {
    if (!isConnected || !address || onWrongChain) return;
    let cancelled = false;
    setOverview({ kind: "loading" });
    getWalletOverview(address)
      .then((data) => {
        if (!cancelled) setOverview({ kind: "ready", data });
      })
      .catch((err: Error) => {
        if (!cancelled) setOverview({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, onWrongChain, refreshKey]);

  // After a confirmed claim, refresh the dashboard so balance/claim update.
  useEffect(() => {
    if (claimConfirmed) setRefreshKey((k) => k + 1);
  }, [claimConfirmed]);

  function handleClaim() {
    resetClaim();
    writeContract({
      address: UBI_SCHEME_ADDRESS,
      abi: ubiClaimAbi,
      functionName: "claim",
    });
  }

  return (
    <main className="app">
      <header>
        <p className="eyebrow">GoodBuilders S4</p>
        <h1>G$ Copilot</h1>
        <p className="subtitle">Your GoodDollar dashboard on Celo.</p>
      </header>

      {!isConnected && (
        <section className="card">
          {miniPay ? (
            <>
              <h2>Connecting to MiniPay…</h2>
              <p className="muted hint">Approve the connection in MiniPay.</p>
            </>
          ) : (
            <>
              <h2>Connect your wallet</h2>
              <p className="muted hint">
                Open this app in MiniPay to connect automatically, or pick a
                wallet below.
              </p>
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  type="button"
                  className="btn"
                  disabled={isPending}
                  onClick={() => connect({ connector })}
                >
                  {isPending ? "Connecting…" : `Connect with ${connector.name}`}
                </button>
              ))}
            </>
          )}
        </section>
      )}

      {isConnected && address && onWrongChain && (
        <section className="card">
          <p className="error">Wrong network — switch to Celo.</p>
          <button
            type="button"
            className="btn"
            onClick={() => switchChain({ chainId: CELO_ID })}
          >
            Switch to Celo
          </button>
        </section>
      )}

      {isConnected && address && !onWrongChain && (
        <section className="card">
          <h2>Wallet</h2>
          <p className="addr">{shorten(address)}</p>

          {overview.kind === "loading" && (
            <p className="muted">Reading your GoodDollar status…</p>
          )}
          {overview.kind === "error" && (
            <p className="error">Couldn't load: {overview.message}</p>
          )}
          {overview.kind === "ready" && (
            <div className="stats">
              <div className="stat">
                <span className="stat-label">Balance</span>
                <span className="stat-value">
                  {formatG(overview.data.balance.balanceFormatted)} G$
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Identity</span>
                <span className="stat-value">
                  {overview.data.verify.isWhitelisted
                    ? "✅ Verified"
                    : "❌ Not verified"}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Daily claim</span>
                <span className="stat-value">
                  {overview.data.claim.eligible
                    ? `🎁 ${formatG(overview.data.claim.claimAmountFormatted)} G$ ready`
                    : overview.data.claim.hasEntitlement
                      ? "Verify to claim"
                      : "Nothing to claim"}
                </span>
              </div>
            </div>
          )}

          {overview.kind === "ready" && overview.data.claim.eligible && (
            <>
              <button
                type="button"
                className="btn"
                disabled={claimPending || claimConfirming}
                onClick={handleClaim}
              >
                {claimPending
                  ? "Confirm in wallet…"
                  : claimConfirming
                    ? "Claiming…"
                    : `Claim ${formatG(overview.data.claim.claimAmountFormatted)} G$`}
              </button>
              {claimConfirmed && claimHash && (
                <p className="success">
                  ✅ Claimed!{" "}
                  <a
                    href={`https://celoscan.io/tx/${claimHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </a>
                </p>
              )}
              {claimError && (
                <p className="error">
                  Claim failed: {claimError.message.split("\n")[0]}
                </p>
              )}
            </>
          )}

          <Link to="/chat" className="btn btn-ghost">
            💬 Ask Copilot
          </Link>

          {!miniPay && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          )}
        </section>
      )}

      {!isConnected && (
        <section className="card">
          <Link to="/chat" className="btn btn-ghost">
            💬 Ask Copilot about GoodDollar
          </Link>
        </section>
      )}
    </main>
  );
}
