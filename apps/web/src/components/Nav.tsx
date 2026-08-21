import {
  useActiveWallet,
  useConnectOrCreateWallet,
  useExportWallet,
  useLogin,
  useModalStatus,
  usePrivy,
  useWallets,
  type ConnectedWallet,
} from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import {
  isEmbeddedWallet,
  pickDefaultWallet,
  sameAddress,
  walletLabel,
} from "../lib/privy-wallet.js";
import { isMobileBrowser } from "../lib/wallet-mobile.js";
import { Logo } from "./Logo.js";
import { NavDropdown } from "./NavDropdown.js";

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function signInErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/origin|allowlist|allowed/i.test(msg)) {
    return "Sign-in blocked for this domain. Add https://goodagentids.xyz to Privy allowed origins.";
  }
  if (/export|private key|embedded wallet/i.test(msg)) {
    return "Could not export the key. Enable private-key export for this app in the Privy dashboard.";
  }
  if (/wallet|provider|ethereum|extension/i.test(msg)) {
    return "Wallet extension conflict. Sign in with Google or email, or try incognito.";
  }
  return (
    msg ||
    "Sign-in failed. Try Google/email, incognito, or disable wallet extensions."
  );
}

export function ConnectButton({ className }: { className?: string }) {
  const { ready, authenticated, logout, connectWallet, user } = usePrivy();
  const { login } = useLogin({
    onError: (err) => {
      setSignInError(signInErrorMessage(err));
      setSigningIn(false);
    },
    onComplete: () => {
      setSignInError(null);
      setSigningIn(false);
    },
  });
  const { connectOrCreateWallet } = useConnectOrCreateWallet({
    onError: (err) => {
      setSignInError(signInErrorMessage(err));
      setWalletBusy(false);
    },
  });
  const { wallets, ready: walletsReady } = useWallets();
  const { exportWallet } = useExportWallet();
  const { isOpen: privyModalOpen } = useModalStatus();
  const { setActiveWallet: setPrivyActive } = useActiveWallet();
  const { setActiveWallet: setWagmiActive } = useSetActiveWallet();
  const { address, isConnected } = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [privyInitTimedOut, setPrivyInitTimedOut] = useState(false);
  const signInAttempt = useRef(0);

  const btnClass = className
    ? `btn btn-wallet ${className}`
    : "btn btn-wallet";

  useEffect(() => {
    if (ready) {
      setPrivyInitTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setPrivyInitTimedOut(true), 6000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (privyModalOpen) setSigningIn(false);
  }, [privyModalOpen]);

  useEffect(() => {
    if (!signingIn) return;
    const attempt = signInAttempt.current;
    const timer = window.setTimeout(() => {
      if (attempt !== signInAttempt.current) return;
      if (!privyModalOpen && !authenticated) {
        setSignInError(
          "Sign-in did not open. Wallet extensions (MetaMask/Rabby) often block it — use Google or email above, or try incognito.",
        );
      }
      setSigningIn(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [signingIn, privyModalOpen, authenticated]);

  const syncDefaultWallet = useCallback(async () => {
    const target = pickDefaultWallet(wallets, user);
    if (!target) return false;
    setPrivyActive(target);
    await setWagmiActive(target);
    return true;
  }, [wallets, user, setPrivyActive, setWagmiActive]);

  const handleSignIn = useCallback(() => {
    if (signingIn || walletBusy) return;
    setSignInError(null);
    setSigningIn(true);
    signInAttempt.current += 1;
    login();
  }, [login, signingIn, walletBusy]);

  const handlePrivyRetry = useCallback(() => {
    setSignInError(null);
    window.location.reload();
  }, []);

  const handleFinishWallet = useCallback(async () => {
    if (walletBusy) return;
    setSignInError(null);
    setWalletBusy(true);
    try {
      if (walletsReady && wallets.length > 0) {
        await syncDefaultWallet();
        return;
      }
      connectOrCreateWallet();
    } catch (err) {
      setSignInError(signInErrorMessage(err));
    } finally {
      window.setTimeout(() => setWalletBusy(false), 400);
    }
  }, [
    walletBusy,
    walletsReady,
    wallets.length,
    syncDefaultWallet,
    connectOrCreateWallet,
  ]);

  useEffect(() => {
    if (!authenticated || isConnected || !walletsReady || wallets.length === 0) {
      return;
    }
    void syncDefaultWallet();
  }, [authenticated, isConnected, walletsReady, wallets.length, syncDefaultWallet]);

  const handleSwitchWallet = useCallback(
    (wallet: ConnectedWallet) => {
      setPrivyActive(wallet);
      void setWagmiActive(wallet);
      setMenuOpen(false);
    },
    [setPrivyActive, setWagmiActive],
  );

  const handleMetaMask = useCallback(() => {
    setMenuOpen(false);
    void connectWallet({
      walletList: isMobileBrowser()
        ? ["metamask", "coinbase_wallet", "wallet_connect"]
        : ["metamask", "coinbase_wallet", "wallet_connect_qr"],
    });
  }, [connectWallet]);

  const embeddedWallet = wallets.find(isEmbeddedWallet);

  const handleExportKey = useCallback(async () => {
    if (!embeddedWallet) return;
    setMenuOpen(false);
    setSignInError(null);
    try {
      await exportWallet({ address: embeddedWallet.address });
    } catch (err) {
      setSignInError(signInErrorMessage(err));
    }
  }, [embeddedWallet, exportWallet]);

  if (!ready) {
    return (
      <div className="connect-signin-wrap">
        <button
          type="button"
          className={btnClass}
          disabled={!privyInitTimedOut}
          onClick={handlePrivyRetry}
        >
          {privyInitTimedOut ? "Retry sign-in" : "…"}
        </button>
        {privyInitTimedOut && (
          <p className="connect-signin-error" role="alert">
            Sign-in failed to load. Wallet extensions (MetaMask/Rabby) often
            block Privy — disable them for this site, then click Retry.
          </p>
        )}
      </div>
    );
  }

  if (authenticated && !isConnected) {
    const hasWallets = walletsReady && wallets.length > 0;
    return (
      <div className="connect-signin-wrap">
        <button
          type="button"
          className={btnClass}
          disabled={walletBusy}
          onClick={() => void handleFinishWallet()}
        >
          {walletBusy || hasWallets ? "Connecting wallet…" : "Set up wallet"}
        </button>
        {signInError && (
          <p className="connect-signin-error" role="alert">
            {signInError}
          </p>
        )}
      </div>
    );
  }

  if (authenticated && isConnected && address) {
    return (
      <div className="connect-signin-wrap">
        <div className="connect-menu">
          <button
            type="button"
            className={btnClass}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {shorten(address)}
          </button>
          {menuOpen && (
            <>
              <div
                className="connect-menu-backdrop"
                aria-hidden
                onClick={() => setMenuOpen(false)}
              />
              <div className="connect-menu-panel" role="menu">
                {wallets.length > 1 && (
                  <div className="connect-menu-wallets" role="group">
                    <p className="connect-menu-label">Active wallet</p>
                    {wallets.map((wallet) => (
                      <button
                        key={wallet.address}
                        type="button"
                        className={`connect-menu-item${
                          sameAddress(wallet.address, address)
                            ? " connect-menu-item-active"
                            : ""
                        }`}
                        role="menuitemradio"
                        aria-checked={sameAddress(wallet.address, address)}
                        onClick={() => handleSwitchWallet(wallet)}
                      >
                        <span>{walletLabel(wallet)}</span>
                        <span className="connect-menu-wallet-addr">
                          {shorten(wallet.address)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="connect-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void login();
                  }}
                >
                  Account &amp; wallets
                </button>
                {embeddedWallet && (
                  <button
                    type="button"
                    className="connect-menu-item"
                    role="menuitem"
                    onClick={() => void handleExportKey()}
                  >
                    Export private key
                  </button>
                )}
                <button
                  type="button"
                  className="connect-menu-item"
                  role="menuitem"
                  onClick={handleMetaMask}
                >
                  Connect MetaMask
                </button>
                <button
                  type="button"
                  className="connect-menu-item connect-menu-item-danger"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout();
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
        {signInError && (
          <p className="connect-signin-error" role="alert">
            {signInError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="connect-signin-wrap">
      <button
        type="button"
        className={btnClass}
        disabled={signingIn}
        onClick={() => void handleSignIn()}
      >
        {signingIn ? "Opening…" : "Sign in"}
      </button>
      {signInError && (
        <p className="connect-signin-error" role="alert">
          {signInError}
        </p>
      )}
    </div>
  );
}

const IDENTITY_LINKS = [
  { to: "/issue", label: "Issue Agent ID", hint: "Vouch as a verified human" },
  { to: "/agents", label: "My Agents", hint: "Agent IDs you've issued" },
  { to: "/verify", label: "Verify", hint: "Check any Agent ID live" },
  { to: "/explore", label: "Registry", hint: "Browse all vouched agents" },
  { to: "/stats", label: "Stats", hint: "Platform analytics" },
] as const;

const DEPLOY_LINKS = [
  { to: "/deploy", label: "Deploy agent", hint: "Spin up a hosted agent" },
  { to: "/deployments", label: "Deployments", hint: "Your live agents" },
  { to: "/skills", label: "Skills", hint: "GameArena & playbooks" },
  {
    to: "/for-agents",
    label: "For agents",
    hint: "Onboarding guide for agents",
  },
] as const;

const IDENTITY_PATHS = ["/issue", "/agents", "/verify", "/explore", "/stats", "/manage"];
const DEPLOY_PATHS = ["/deploy", "/deployments", "/dashboard", "/skills", "/for-agents"];

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="container nav">
        <Link to="/" className="brand">
          <Logo className="brand-logo" />
          GoodAgent
        </Link>

        <nav id="site-nav-panel" className="nav-links nav-desktop">
          <NavDropdown
            label="Identity"
            paths={IDENTITY_PATHS}
            items={[...IDENTITY_LINKS]}
          />
          <NavDropdown
            label="Deploy"
            paths={DEPLOY_PATHS}
            items={[...DEPLOY_LINKS]}
          />
        </nav>

        <div className="nav-actions">
          <ConnectButton />
          <button
            type="button"
            className={`nav-menu-toggle${menuOpen ? " open" : ""}`}
            aria-expanded={menuOpen}
            aria-controls="site-nav-mobile"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="nav-menu-bar" />
            <span className="nav-menu-bar" />
            <span className="nav-menu-bar" />
          </button>
        </div>
      </div>

      <div
        className={`nav-mobile-panel${menuOpen ? " open" : ""}`}
        id="site-nav-mobile"
        hidden={!menuOpen}
      >
        <div className="nav-mobile-section">
          <p className="nav-mobile-label">Identity</p>
          {IDENTITY_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="nav-mobile-link"
              onClick={() => setMenuOpen(false)}
            >
              <span>{item.label}</span>
              {item.hint && <small>{item.hint}</small>}
            </NavLink>
          ))}
        </div>
        <div className="nav-mobile-section">
          <p className="nav-mobile-label">Deploy</p>
          {DEPLOY_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="nav-mobile-link"
              onClick={() => setMenuOpen(false)}
            >
              <span>{item.label}</span>
              {item.hint && <small>{item.hint}</small>}
            </NavLink>
          ))}
        </div>
      </div>

      {menuOpen && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </header>
  );
}
