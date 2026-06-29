import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { sendChat, type ChatMessage } from "../lib/api.js";

const SUGGESTIONS = [
  "What's my G$ balance?",
  "Am I verified?",
  "Can I claim my daily UBI?",
  "What is GoodDollar?",
];

export function Chat() {
  const { address } = useAccount();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const result = await sendChat(next, address);
      setMessages([
        ...next,
        { role: "assistant", content: result.reply || "(no answer)" },
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header>
        <p className="eyebrow">GoodBuilders S4</p>
        <h1>Ask Copilot</h1>
        <p className="subtitle">
          {address
            ? "Ask about your GoodDollar wallet, live on Celo."
            : "Connect a wallet for personalized answers."}
        </p>
      </header>

      <section className="card chat">
        <div className="chat-log" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <p className="muted">Try asking:</p>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip"
                    onClick={() => ask(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble bubble-${m.role}`}>
              {m.content}
            </div>
          ))}
          {busy && <div className="bubble bubble-assistant typing">Thinking…</div>}
        </div>

        {error && <p className="error">{error}</p>}

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            type="text"
            value={input}
            placeholder="Ask anything about GoodDollar…"
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </section>

      <Link to="/" className="btn btn-ghost">
        ← Back to dashboard
      </Link>
    </main>
  );
}
