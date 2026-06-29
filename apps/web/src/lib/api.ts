// Default to same-origin "/api" (Vite proxy in dev). Override with an absolute
// URL via VITE_API_BASE_URL when the API is hosted separately.
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

// ---------------------------------------------------------------------------
// Wallet overview — GoodDollar identity status for a Celo address.
// ---------------------------------------------------------------------------

export interface WalletOverview {
  address: string;
  balance: { balance: string; balanceFormatted: string; symbol: string };
  verify: { isWhitelisted: boolean; root: string | null; expiresAt: string | null };
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

// ---------------------------------------------------------------------------
// Agent ID — issue / verify / list
// ---------------------------------------------------------------------------

export interface AgentIdFieldsWire {
  agent: string;
  operator: string;
  humanRoot: string;
  scopes: string;
  stake: string;
  budgetCap: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export interface IssueAgentBody {
  fields: AgentIdFieldsWire;
  signature: string;
  chainId: number;
  verifyingContract: string;
}

export interface VerifyResult {
  found?: boolean;
  valid: boolean;
  reason?: string;
  agent?: string;
  operator?: string;
  humanRoot?: string;
  scopes?: string;
  stake?: string;
  budgetCap?: string;
  expiresAt?: string;
}

export interface IssueResult {
  ok: boolean;
  agent: string;
  verification: VerifyResult;
}

export async function issueAgent(body: IssueAgentBody): Promise<IssueResult> {
  const res = await fetch(`${API_BASE}/agent/issue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const reason = (data.reason as string) ?? (data.error as string);
    throw new Error(reason ?? `Issue failed (${res.status})`);
  }
  return data as unknown as IssueResult;
}

export async function verifyAgent(address: string): Promise<VerifyResult> {
  const res = await fetch(`${API_BASE}/agent/verify/${address}`);
  if (!res.ok && res.status !== 404) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Verify failed (${res.status})`);
  }
  return (await res.json()) as VerifyResult;
}

export interface AgentListItem {
  agent: string;
  scopes: string;
  stake: string;
  budgetCap: string;
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
}

export interface AgentListResult {
  operator: string;
  count: number;
  agents: AgentListItem[];
}

export async function listAgents(operator: string): Promise<AgentListResult> {
  const res = await fetch(`${API_BASE}/agent/list?operator=${operator}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `List failed (${res.status})`);
  }
  return (await res.json()) as AgentListResult;
}

// ---------------------------------------------------------------------------
// Copilot chat (optional secondary feature)
// ---------------------------------------------------------------------------

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
