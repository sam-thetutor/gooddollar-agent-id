export interface WalletOverview {
  address: string;
  verify: {
    isWhitelisted: boolean;
    root: string | null;
    statusLabel: string;
  };
}

export interface IssueAgentBody {
  fields: {
    agent: string;
    operator: string;
    humanRoot: string;
    nonce: string;
    issuedAt: string;
    expiresAt: string;
  };
  signature: string;
  chainId: number;
  verifyingContract: string;
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

export function createApiClient(apiBaseUrl: string) {
  const base = normalizeBase(apiBaseUrl);

  return {
    async getWalletOverview(address: string): Promise<WalletOverview> {
      const res = await fetch(`${base}/wallet/${address}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Wallet API ${res.status}`);
      }
      return (await res.json()) as WalletOverview;
    },

    async issueAgent(body: IssueAgentBody): Promise<{ agent: string }> {
      const res = await fetch(`${base}/agent/issue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        agent?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Issue API ${res.status}`);
      return { agent: data.agent ?? body.fields.agent };
    },

    verifyAgentUrl(agentAddress: string): string {
      return `${base}/agent/verify/${agentAddress}`;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
