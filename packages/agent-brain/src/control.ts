/**
 * Client for the host's internal agent-control endpoints. The brain runs as a
 * separate PM2 process, so it can pause/resume the worker process(es) of its
 * own deploy without killing itself. Authorization lives on the host: every
 * call carries the sender's Telegram user id and the host only honours the
 * linked operator.
 */
export interface ControlClientOptions {
  hostUrl: string;
  deployId: string;
  secret: string;
  fetchImpl?: typeof fetch;
}

export type ControlAction = "pause" | "resume" | "status";

export interface ControlProcessSnapshot {
  name?: string;
  status?: string;
  online?: boolean;
  uptimeMs?: number;
  restarts?: number;
}

export interface ControlResponse {
  ok: boolean;
  /** Host error code (NOT_OPERATOR, NOT_LINKED, START_FAILED, ...). */
  error?: string;
  message?: string;
  status?: string;
  displayName?: string;
  workers?: ControlProcessSnapshot | null;
  brain?: ControlProcessSnapshot | null;
  result?: string;
}

export interface ClaimLinkResponse {
  ok: boolean;
  error?: string;
  message?: string;
  displayName?: string;
}

export interface ControlClient {
  claimLink(input: {
    token: string;
    telegramUserId: number;
    telegramUsername?: string;
  }): Promise<ClaimLinkResponse>;
  control(action: ControlAction, telegramUserId: number): Promise<ControlResponse>;
}

export function createControlClient(options: ControlClientOptions): ControlClient {
  const fetchFn = options.fetchImpl ?? fetch;
  const base = `${options.hostUrl.replace(/\/$/, "")}/internal/deploy/${options.deployId}`;

  async function post<T extends { ok?: boolean; error?: string; message?: string }>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetchFn(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-host-secret": options.secret,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as T | null;
    if (json) return { ok: res.ok && json.ok !== false, ...json };
    return {
      ok: false,
      error: "HOST_UNREACHABLE",
      message: `host replied ${res.status} with no body`,
    } as T;
  }

  return {
    async claimLink(input) {
      return post<ClaimLinkResponse>("/telegram/claim-link", {
        token: input.token,
        telegramUserId: input.telegramUserId,
        telegramUsername: input.telegramUsername,
      });
    },
    async control(action, telegramUserId) {
      return post<ControlResponse>("/control", { action, telegramUserId });
    },
  };
}
