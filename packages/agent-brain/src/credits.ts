/**
 * Thin client for the GoodDollar AntSeed Worker — the G$ credit accounting
 * gateway from https://github.com/GoodDollar/antseed-integration.
 *
 * Payment model recap (see REAL_AGENT_ARCHITECTURE.md):
 * - Users/operators pay in G$ on Celo (deposit to the vault or Superfluid stream).
 * - The Worker records the Celo tx and issues G$-denominated compute credits
 *   (+bonuses for GoodID-verified humans / streamers).
 * - A backend operator bridges to USDC on Base and funds the AntSeed buyer.
 *   Nobody user-facing ever touches USDC.
 */
export interface GdAntseedCreditsClientOptions {
  /** Worker origin, e.g. `https://gd-antseed-worker.example.workers.dev`. */
  workerUrl: string;
  fetchImpl?: typeof fetch;
}

export interface CreditsProfile {
  buyer: string;
  /** G$-denominated credit balance as reported by the Worker. */
  credits?: string | number;
  [key: string]: unknown;
}

export interface RecordCeloEventResult {
  txHash: string;
  [key: string]: unknown;
}

export interface GdAntseedCreditsClient {
  /** Credit balance + funding history for a buyer address. */
  getProfile(buyer: string): Promise<CreditsProfile>;
  /** Submit a Celo G$ deposit txHash so the Worker issues credits. */
  recordCeloEvent(txHash: string): Promise<RecordCeloEventResult>;
  /** Pending/failed funding entries awaiting bridge settlement. */
  getOutstanding(): Promise<unknown>;
  /** Worker health: vault configured, bridge enabled. */
  getConfigStatus(): Promise<Record<string, unknown>>;
}

export function createGdAntseedCreditsClient(
  options: GdAntseedCreditsClientOptions,
): GdAntseedCreditsClient {
  const base = options.workerUrl.replace(/\/$/, "");
  const fetchFn = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchFn(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `gd-antseed worker ${path} failed: ${res.status} ${text.slice(0, 300)}`,
      );
    }
    return (await res.json()) as T;
  }

  return {
    getProfile(buyer) {
      return request<CreditsProfile>(
        `/v1/accounts/${encodeURIComponent(buyer)}/profile`,
      );
    },
    recordCeloEvent(txHash) {
      return request<RecordCeloEventResult>(`/v1/celo/events/record`, {
        method: "POST",
        body: JSON.stringify({ txHash }),
      });
    },
    getOutstanding() {
      return request<unknown>(`/v1/celo/events/outstanding`);
    },
    getConfigStatus() {
      return request<Record<string, unknown>>(`/config/status`);
    },
  };
}
