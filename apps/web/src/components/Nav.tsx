import { useAppKit } from "@reown/appkit/react";
import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { Logo } from "./Logo.js";
import { NavDropdown } from "./NavDropdown.js";

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectButton({ className }: { className?: string }) {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();

  const handleConnect = useCallback(async () => {
    await open({ view: "Connect" });
  }, [open]);

  const btnClass = className
    ? `btn btn-wallet ${className}`
    : "btn btn-wallet";

  if (isConnected && address) {
    return (
      <button
        type="button"
        className={btnClass}
        onClick={() => open({ view: "Account" })}
      >
        {shorten(address)}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={btnClass}
      onClick={() => void handleConnect()}
    >
      Connect Wallet
    </button>
  );
}

const IDENTITY_LINKS = [
  { to: "/issue", label: "Issue Agent ID", hint: "Vouch as a verified human" },
  { to: "/agents", label: "My Agents", hint: "Agent IDs you've issued" },
  { to: "/verify", label: "Verify", hint: "Check any Agent ID live" },
  { to: "/explore", label: "Registry", hint: "Browse all vouched agents" },
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

const IDENTITY_PATHS = ["/issue", "/agents", "/verify", "/explore", "/manage"];
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
