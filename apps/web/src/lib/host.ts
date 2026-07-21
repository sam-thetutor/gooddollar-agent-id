/** Host supervisor API (autonomous deploy). */
import type { DeployControlAuth } from "@goodagent/shared";

function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

/** Production uses same-origin /host (nginx → localhost:3010). Never bake dev localhost into prod. */
function resolveHostBase(): string {
  if (import.meta.env.PROD) {
    const configured = import.meta.env.VITE_HOST_BASE_URL?.trim();
    if (configured && !isLocalhostUrl(configured)) {
      return configured.replace(/\/$/, "");
    }
    return "/host";
  }
  const configured = import.meta.env.VITE_HOST_BASE_URL?.trim();
  const useLocal = import.meta.env.VITE_HOST_USE_LOCAL === "1";
  if (configured && (useLocal || !isLocalhostUrl(configured))) {
    return configured;
  }
  return "https://gcopilot-api.geinz.lol/host";
}

const HOST_BASE = resolveHostBase();

function resolveHostListBase(): string {
  const configured = import.meta.env.VITE_HOST_LIST_BASE_URL?.trim();
  if (configured && !isLocalhostUrl(configured)) {
    return configured.replace(/\/$/, "");
  }
  return HOST_BASE;
}

const HOST_LIST_BASE = resolveHostListBase();

export interface DeployAgent {
  id: string;
  displayName: string;
  template: string;
  status: string;
  agentAddress: string | null;
  ownerWallet: string | null;
  pm2Name: string | null;
  lastError: string | null;
  deployedAt: string | null;
  createdAt: string;
  configuration?: string | null;
  skills?: Array<{ skillId: string; registryPath: string }>;
}

export interface DeployStatusResponse {
  id: string;
  displayName?: string;
  template?: string;
  skillId?: string | null;
  configuration?: string | null;
  status: string;
  ownerWallet?: string | null;
  agentAddress: string | null;
  pm2Name: string | null;
  lastError: string | null;
  lastHeartbeatAt?: string | null;
  deployedAt: string | null;
  pipelineRunning: boolean;
  pm2: {
    name: string;
    status: string;
    online: boolean;
    memoryMb?: number;
    cpu?: number;
    uptimeMs?: number;
    restarts?: number;
  } | null;
  verify: {
    found?: boolean;
    valid?: boolean;
    agentProven?: boolean;
    reason?: string;
  } | null;
  stats?: DeployStats | null;
}

export interface DeployStats {
  balances: {
    celo: string;
    celoFormatted: string;
    gDollar: string;
    gDollarFormatted: string;
  } | null;
  performance: {
    skill: string;
    playMode?: "offchain" | "onchain";
    gamesPlayed: number;
    wins: number;
    losses: number;
    unresolved: number;
    wagerGs: number | null;
    netPnLGs: number;
    todayNetPnLGs: number;
    lostTodayGs: number;
    matchesToday: number;
    summary: string | null;
    matches: Array<{
      matchId: string;
      result: string;
      wagerGs: number;
      at: string;
    }>;
    recentMatches: Array<{
      matchId: string;
      result: string;
      wagerGs: number;
      at: string;
    }>;
  } | null;
  walletPnL: {
    baselineBalanceGs: number | null;
    baselineSource: "snapshot" | "config" | "manual" | null;
    currentBalanceGs: number | null;
    walletDeltaGs: number | null;
    ledgerDeltaGs: number | null;
    deltaMismatchGs: number | null;
  } | null;
  logTail: string | null;
  ladder?: GamearenaLadder | null;
}

export interface GamearenaLadder {
  rank: number | null;
  points: number | null;
  wins: number | null;
  matches: number | null;
  remainingToday: number | null;
  top: Array<{
    rank: number;
    wallet: string;
    points: number;
    matches: number;
    wins: number;
    username: string | null;
  }>;
  error: string | null;
}

export function getDeploy(deployId: string) {
  return hostFetch<{ agent: DeployAgent }>(`/deploy/${deployId}`);
}

export type SkillConfiguration = Record<string, string>;

async function hostFetch<T>(
  path: string,
  init?: RequestInit,
  base: string = HOST_BASE,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (method !== "GET" && method !== "HEAD" && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Host API timed out after 60s — try again in a moment.");
    }
    throw new Error(
      `Host API unreachable (${base}${path}). Check your connection and refresh.`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: string; message?: string }).message ??
        (body as { error?: string }).error ??
        `Host API ${res.status}`,
    );
  }
  return body as T;
}

export function createDeploy(input: {
  displayName: string;
  ownerWallet: string;
  skillId: string;
  configuration?: SkillConfiguration;
  telegramBotToken?: string;
  template?: string;
  skipPayment?: boolean;
}) {
  return hostFetch<{ agent: DeployAgent }>("/deploy", {
    method: "POST",
    body: JSON.stringify({
      displayName: input.displayName,
      ownerWallet: input.ownerWallet,
      skillId: input.skillId,
      configuration: input.configuration,
      telegramBotToken: input.telegramBotToken,
      template: input.template ?? "gaming",
      skipPayment: input.skipPayment ?? true,
    }),
  });
}

export function runDeployPipeline(
  deployId: string,
  opts: DeployControlAuth,
) {
  return hostFetch<{ accepted: boolean; deployId: string }>(
    `/deploy/${deployId}/run-pipeline`,
    {
      method: "POST",
      body: JSON.stringify(opts),
    },
  );
}

export async function getDeployStatus(deployId: string) {
  const prefetch = window.__deployStatusPrefetch;
  if (prefetch) {
    window.__deployStatusPrefetch = undefined;
    try {
      const data = await prefetch;
      if (data?.id === deployId) return data as DeployStatusResponse;
    } catch {
      // fall through to normal fetch
    }
  }
  return hostFetch<DeployStatusResponse>(`/deploy/${deployId}/status`);
}

export function listDeploysByOwner(ownerWallet: string) {
  return hostFetch<{ agents: DeployAgent[] }>(
    `/deploy?ownerWallet=${encodeURIComponent(ownerWallet)}`,
    undefined,
    HOST_LIST_BASE,
  );
}

export function stopDeploy(deployId: string, auth: DeployControlAuth) {
  return hostFetch<{ agent: DeployAgent }>(`/deploy/${deployId}/stop`, {
    method: "POST",
    body: JSON.stringify(auth),
  });
}

export function startDeploy(deployId: string, auth: DeployControlAuth) {
  return hostFetch<
    | { agent: DeployAgent }
    | { accepted: boolean; reprovisioning: boolean; deployId: string }
  >(`/deploy/${deployId}/start`, {
    method: "POST",
    body: JSON.stringify(auth),
  });
}

export function setDeployBaseline(
  deployId: string,
  balanceGs: number,
  auth: DeployControlAuth,
) {
  return hostFetch<{ ok: boolean; balanceGs: number }>(
    `/deploy/${deployId}/baseline`,
    {
      method: "POST",
      body: JSON.stringify({ balanceGs, ...auth }),
    },
  );
}

export function updateDeployConfiguration(
  deployId: string,
  configuration: SkillConfiguration,
  auth: DeployControlAuth,
) {
  return hostFetch<{ agent: DeployAgent; restarted: boolean }>(
    `/deploy/${deployId}/configuration`,
    {
      method: "POST",
      body: JSON.stringify({ configuration, ...auth }),
    },
  );
}
