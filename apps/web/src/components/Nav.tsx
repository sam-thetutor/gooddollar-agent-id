import { useAppKit } from "@reown/appkit/react";
import { Link, NavLink } from "react-router-dom";
import { useAccount } from "wagmi";
import { Logo } from "./Logo.js";
import { NavDropdown } from "./NavDropdown.js";

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();

  if (isConnected && address) {
    return (
      <button
        type="button"
        className="btn btn-wallet"
        onClick={() => open({ view: "Account" })}
      >
        {shorten(address)}
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-wallet" onClick={() => open()}>
      Connect Wallet
    </button>
  );
}

export function Nav() {
  return (
    <header className="site-header">
      <div className="container nav">
        <Link to="/" className="brand">
          <Logo className="brand-logo" />
          GoodAgent
        </Link>
        <div className="nav-links">
          <NavDropdown
            label="Agents"
            paths={["/agents", "/deployments", "/deploy", "/issue", "/manage"]}
            items={[
              { to: "/agents", label: "My Agents", hint: "IDs you issued" },
              {
                to: "/deployments",
                label: "Deployments",
                hint: "Live supervisors",
              },
              { to: "/deploy", label: "Deploy agent", hint: "GameArena & more" },
              { to: "/issue", label: "Issue Agent ID", hint: "Vouch on-chain" },
            ]}
          />
          <NavLink to="/verify" className="nav-link">
            Verify
          </NavLink>
          <NavDropdown
            label="Explore"
            paths={["/explore", "/skills", "/for-agents"]}
            items={[
              { to: "/explore", label: "Registry", hint: "All agents" },
              { to: "/skills", label: "Skills", hint: "Gaming playbooks" },
              { to: "/for-agents", label: "For agents", hint: "Dev guide" },
            ]}
          />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
