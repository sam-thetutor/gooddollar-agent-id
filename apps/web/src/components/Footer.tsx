import { Logo } from "./Logo.js";

const VAULT_URL =
  "https://celoscan.io/address/0x2CcDe0a686927E482Ae998550c97949965BeDC84";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="brand">
            <Logo className="brand-logo" />
            GoodDollar Agent ID
          </span>
          <p className="muted">
            The passport-free Proof-of-Human layer for AI agents. Built on Celo
            for GoodBuilders Season 4.
          </p>
        </div>

        <div className="footer-links">
          <div className="footer-col">
            <h4>Product</h4>
            <a href="/issue">Issue an Agent ID</a>
            <a href="/verify">Verify an agent</a>
            <a href="/agents">My Agents</a>
          </div>
          <div className="footer-col">
            <h4>Ecosystem</h4>
            <a href="https://gooddollar.org" target="_blank" rel="noreferrer">
              GoodDollar
            </a>
            <a href="https://celo.org" target="_blank" rel="noreferrer">
              Celo
            </a>
            <a href={VAULT_URL} target="_blank" rel="noreferrer">
              AgentVault (Celoscan)
            </a>
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        © {new Date().getFullYear()} GoodDollar Agent ID · Non-custodial ·
        Open source
      </div>
    </footer>
  );
}
