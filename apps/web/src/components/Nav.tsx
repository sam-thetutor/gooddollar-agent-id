import { useAppKit } from "@reown/appkit/react";
import { Link, NavLink } from "react-router-dom";
import { useAccount } from "wagmi";
import { Logo } from "./Logo.js";

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
          GoodDollar Agent ID
        </Link>
        <div className="nav-links">
          <NavLink to="/issue" className="nav-link">
            Issue
          </NavLink>
          <NavLink to="/agents" className="nav-link">
            My Agents
          </NavLink>
          <NavLink to="/verify" className="nav-link">
            Verify
          </NavLink>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
