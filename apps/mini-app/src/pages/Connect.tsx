import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { CELO_ID } from "../lib/wagmi.js";
import { linkWallet } from "../lib/api.js";
import {
  buildExternalUrl,
  buildMetaMaskDappLink,
  closeApp,
  getInitData,
  getLinkToken,
  getTelegramId,
  isInsideTelegram,
  isMiniPay,
  isTelegramDesktop,
  openExternal,
} from "../lib/telegram.js";

type LinkState =
  | { kind: "idle" }
  | { kind: "linking" }
  | { kind: "done" }
  | { kind: "error"; message: string };

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function Connect() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [linkState, setLinkState] = useState<LinkState>({ kind: "idle" });

  const telegramId = useMemo(() => getTelegramId(), []);
  const token = useMemo(() => getLinkToken(), []);
  const insideTelegram = useMemo(() => isInsideTelegram(), []);
  const miniPay = useMemo(() => isMiniPay(), []);
  const desktopTelegram = useMemo(
    () => insideTelegram && isTelegramDesktop(),
    [insideTelegram],
  );
  const injectedConnector = useMemo(
    () => connectors.find((c) => c.id === "injected"),
    [connectors],
  );
  const autoConnectAttempted = useRef(false);
  const onWrongChain = isConnected && chainId !== CELO_ID;

  // MiniPay: auto-connect on load via the injected provider (per MiniPay
  // guidelines — no connect button, connection is automatic).
  useEffect(() => {
    if (!miniPay || isConnected || autoConnectAttempted.current) return;
    if (!injectedConnector) return;
    autoConnectAttempted.current = true;
    connect({ connector: injectedConnector });
  }, [miniPay, isConnected, injectedConnector, connect]);

  // Inside Telegram's in-app browser, the injected connector is meaningless and
  // deep-links are unreliable — only show WalletConnect there.
  const visibleConnectors = useMemo(() => {
    if (!insideTelegram) return connectors;
    const wc = connectors.filter((c) => c.id === "walletConnect");
    return wc.length > 0 ? wc : connectors;
  }, [connectors, insideTelegram]);

  // Auto-link once we have a connected wallet on Celo and a Telegram id.
  useEffect(() => {
    if (!isConnected || !address || onWrongChain) return;
    if (!telegramId) return;
    if (linkState.kind !== "idle") return;

    setLinkState({ kind: "linking" });
    linkWallet({
      telegramId,
      wallet: address,
      initData: getInitData() || undefined,
      token: token ?? undefined,
    })
      .then(() => {
        setLinkState({ kind: "done" });
        if (insideTelegram) setTimeout(closeApp, 1500);
      })
      .catch((err: Error) =>
        setLinkState({ kind: "error", message: err.message }),
      );
  }, [
    isConnected,
    address,
    onWrongChain,
    telegramId,
    token,
    linkState.kind,
    insideTelegram,
  ]);

  return (
    <main className="app">
      <header>
        <p className="eyebrow">GoodBuilders S4</p>
        <h1>Connect your Celo wallet</h1>
        <p className="subtitle">Supports MiniPay, Valora, and MetaMask.</p>
      </header>

      {!telegramId && (
        <section className="card warn">
          <p>
            No Telegram session found. Open this page from the bot with{" "}
            <strong>/connect</strong>, or add <code>?tg=&lt;id&gt;</code> to the
            URL for browser testing.
          </p>
        </section>
      )}

      {!isConnected && desktopTelegram && (
        <section className="card">
          <h2>Open in your browser</h2>
          <p className="muted hint">
            Telegram's desktop app can't show the WalletConnect QR. Tap below to
            open this page in your normal browser, then scan the QR with your
            phone wallet. You'll stay linked to this Telegram account.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => openExternal(buildExternalUrl())}
          >
            Open in browser
          </button>
        </section>
      )}

      {!isConnected && miniPay && (
        <section className="card">
          <h2>Connecting to MiniPay…</h2>
          <p className="muted hint">
            Approve the connection in MiniPay to link your wallet.
          </p>
          {connectError && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                injectedConnector && connect({ connector: injectedConnector })
              }
            >
              Retry
            </button>
          )}
        </section>
      )}

      {!isConnected && !miniPay && insideTelegram && !desktopTelegram && (
        <section className="card">
          <h2>Connect with MetaMask</h2>
          <p className="muted hint">
            Opens this page inside MetaMask's browser so it can connect directly.
            Telegram blocks the normal wallet pop-up, so use this on mobile.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => openExternal(buildMetaMaskDappLink())}
          >
            Open in MetaMask
          </button>
          <p className="muted hint">
            Using Valora or another wallet? Use the options below.
          </p>
        </section>
      )}

      {!isConnected && !miniPay && !desktopTelegram && (
        <section className="card">
          <h2>Choose a wallet</h2>
          {visibleConnectors.map((connector) => (
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

          {insideTelegram && (
            <>
              <p className="muted hint">
                Wallet not opening? Telegram's in-app browser blocks some wallet
                links. Open this page in your normal browser instead:
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => openExternal(buildExternalUrl())}
              >
                Open in browser
              </button>
            </>
          )}

          {!insideTelegram && (
            <p className="muted hint">
              On a computer? Pick WalletConnect and scan the QR with your phone
              wallet.
            </p>
          )}

          {connectError && <p className="error">{connectError.message}</p>}
        </section>
      )}

      {isConnected && address && (
        <section className="card">
          <h2>Wallet connected</h2>
          <p className="addr">{shorten(address)}</p>

          {onWrongChain ? (
            <>
              <p className="error">Wrong network — switch to Celo.</p>
              <button
                type="button"
                className="btn"
                onClick={() => switchChain({ chainId: CELO_ID })}
              >
                Switch to Celo
              </button>
            </>
          ) : (
            <>
              {linkState.kind === "linking" && (
                <p className="muted">Linking to your Telegram account…</p>
              )}
              {linkState.kind === "done" && (
                <p className="success">
                  ✅ Linked!{" "}
                  {insideTelegram
                    ? "Returning to chat…"
                    : "You can return to Telegram and send /status."}
                </p>
              )}
              {linkState.kind === "error" && (
                <p className="error">Link failed: {linkState.message}</p>
              )}
              {!telegramId && (
                <p className="muted">Connected, but no Telegram session to link.</p>
              )}
            </>
          )}

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              disconnect();
              setLinkState({ kind: "idle" });
            }}
          >
            Disconnect
          </button>
        </section>
      )}
    </main>
  );
}
