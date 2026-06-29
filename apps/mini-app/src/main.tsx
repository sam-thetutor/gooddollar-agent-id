import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import "./index.css";

// NOTE: StrictMode intentionally omitted — its dev-only double-mount resets
// in-flight WalletConnect pairings ("Connection request reset").
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
