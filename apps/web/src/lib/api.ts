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

export interface OnchainStatus {
  vaultConfigured: boolean;
  operator: string | null;
  stake: string;
  stakeFormatted: string;
  minStake: string;
  minStakeFormatted: string;
  meetsMinStake: boolean;
  unstakeUnlockAt: string | null;
}

export interface VerifyResult {
  found?: boolean;
  valid: boolean;
  reason?: string;
  agent?: string;
  operator?: string;
  humanRoot?: string;
  expiresAt?: string;
  onchain?: OnchainStatus | null;
  /** Present only when the caller passed a verifier-chosen `minStake`. */
  minStake?: string;
  meetsMinStake?: boolean;
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
    const msg =
      (data.message as string) ??
      (data.reason as string) ??
      (data.error as string);
    throw new Error(msg ?? `Issue failed (${res.status})`);
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
  operator: string;
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
}

export interface AgentListResult {
  operator?: string;
  humanRoot?: string;
  count: number;
  activeCount: number;
  maxPerHuman: number;
  agents: AgentListItem[];
}

/** List agents by the operator wallet that signed them. */
export async function listAgents(operator: string): Promise<AgentListResult> {
  const res = await fetch(`${API_BASE}/agent/list?operator=${operator}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `List failed (${res.status})`);
  }
  return (await res.json()) as AgentListResult;
}

/** List every agent a GoodDollar human (root) has vouched for. */
export async function listAgentsByHumanRoot(
  humanRoot: string,
): Promise<AgentListResult> {
  const res = await fetch(`${API_BASE}/agent/list?humanRoot=${humanRoot}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `List failed (${res.status})`);
  }
  return (await res.json()) as AgentListResult;
}
