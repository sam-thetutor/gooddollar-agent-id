import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { initTelegram } from "./lib/telegram.js";
import { config } from "./lib/wagmi.js";
import { Chat } from "./pages/Chat.js";
import { Connect } from "./pages/Connect.js";
import { Home } from "./pages/Home.js";

const queryClient = new QueryClient();

function SignPlaceholder() {
  return (
    <main className="app">
      <header>
        <p className="eyebrow">GoodBuilders S4</p>
        <h1>Sign action</h1>
      </header>
      <section className="card muted">
        <p>Transaction signing ships in Phase 5.</p>
      </section>
    </main>
  );
}

export function App() {
  useEffect(() => {
    initTelegram();
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/sign/:actionId" element={<SignPlaceholder />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
