import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { WebProviders } from "./providers/WebProviders.js";
import "@goodagent/live-arena/styles.css";
import "./index.css";

// NOTE: StrictMode intentionally omitted — its dev-only double-mount can
// interrupt WalletConnect / Privy wallet pairing mid-flow.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <WebProviders>
      <App />
    </WebProviders>
  </ErrorBoundary>,
);
