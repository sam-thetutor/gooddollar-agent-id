// Default to the same-origin "/api" path (proxied by Vite to the API in dev,
// and works behind a single HTTPS tunnel). Override with an absolute URL if the
// API is hosted separately.
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export interface LinkWalletInput {
  telegramId: string;
  wallet: string;
  initData?: string;
  token?: string;
}

export async function linkWallet(input: LinkWalletInput): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Link failed (${res.status})`);
  }
}

export interface WalletOverview {
  address: string;
  balance: { balance: string; balanceFormatted: string; symbol: string };
  verify: { isWhitelisted: boolean; expiresAt: string | null };
  claim: {
    eligible: boolean;
    isWhitelisted: boolean;
    hasEntitlement: boolean;
    claimAmountFormatted: string;
  };
}

export async function getWalletOverview(
  address: string,
): Promise<WalletOverview> {
  const res = await fetch(`${API_BASE}/wallet/${address}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to load wallet (${res.status})`);
  }
  return (await res.json()) as WalletOverview;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  reply: string;
  toolsUsed: string[];
}

export async function sendChat(
  messages: ChatMessage[],
  wallet?: string,
): Promise<ChatResult> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, wallet }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "LLM_NOT_CONFIGURED") {
      throw new Error("The AI copilot isn't configured yet.");
    }
    throw new Error(body.error ?? `Chat failed (${res.status})`);
  }
  return (await res.json()) as ChatResult;
}
