import type { GamearenaPartnerConfigField } from "@goodagent/shared";
import { GOODAGENT_HOST_URL } from "../public-urls.js";
import type { DeployControlAction } from "../deploy-auth.js";
import type { GoodAgentWalletAdapter } from "../types.js";
import {
  signDeployControl,
  type DeployControlAuth,
} from "./host.js";

export type GameArenaPartnerConfiguration = Record<string, string>;

export interface GameArenaPartnerAgent {
  deployId: string;
  displayName: string;
  agentAddress: string | null;
  ownerWallet: string | null;
  gamePassUsername: string | null;
  status: string;
  verified: boolean;
  readyToPlay: boolean;
  dailyCapReached?: boolean;
  matchesToday?: number | null;
  dailyMatchCap?: number | null;
  activeMatchId: string | null;
  livePhase: "starting" | "playing" | null;
  liveWatchUrl: string | null;
}

export interface GameArenaPartnerAgentsResponse {
  owner: string;
  agents: GameArenaPartnerAgent[];
}

export interface GameArenaPartnerSettingsResponse {
  owner?: string;
  deployId: string;
  displayName: string;
  agentAddress: string | null;
  ownerWallet: string | null;
  status: string;
  verified: boolean;
  readyToPlay: boolean;
  dailyCapReached?: boolean;
  matchesToday?: number | null;
  dailyMatchCap?: number | null;
  configuration: GameArenaPartnerConfiguration;
}

export interface GameArenaPartnerSettingsSchema {
  skillId: string;
  fields: GamearenaPartnerConfigField[];
}

export interface GameArenaPartnerUpdateSettingsResponse {
  owner?: string;
  deployId: string;
  configuration: GameArenaPartnerConfiguration;
  restarted: boolean;
}

export interface GameArenaPartnerControlResponse {
  deployId: string;
  status: string;
  pm2Name?: string;
}

export interface GameArenaPartnerPlayResponse {
  deployId: string;
  agentAddress: string | null;
  matchId: string;
  livePhase: "starting";
  liveWatchUrl: string;
  pollUrl: string;
}

export interface GameArenaPartnerLiveResponse {
  owner?: string;
  deployId: string;
  activeMatchId: string | null;
  livePhase: "starting" | "playing" | null;
  liveWatchUrl: string | null;
}

export class GameArenaPartnerApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const record = body as { error?: string; message?: string };
    super(record.message ?? record.error ?? `GameArena partner API ${status}`);
    this.name = "GameArenaPartnerApiError";
    this.status = status;
    this.code = record.error;
    this.body = body;
  }
}

export interface GameArenaPartnerClientOptions {
  /** GoodAgent host base, e.g. `https://goodagentids.xyz/host`. */
  hostBaseUrl?: string;
  /** Sent as `x-partner-key` when the host sets `GAMEARENA_PARTNER_API_KEY`. */
  partnerKey?: string;
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

function ownerQuery(owner: string): string {
  return `owner=${encodeURIComponent(owner)}`;
}

export function createGameArenaPartnerClient(
  options: GameArenaPartnerClientOptions = {},
) {
  const hostBase = normalizeBase(options.hostBaseUrl ?? GOODAGENT_HOST_URL);
  const base = `${hostBase}/partners/gamearena`;

  function buildHeaders(
    init?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = { ...init };
    const key = options.partnerKey?.trim();
    if (key) headers["x-partner-key"] = key;
    return headers;
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = buildHeaders(init?.headers as Record<string, string> | undefined);
    if (method !== "GET" && method !== "HEAD" && !headers["content-type"]) {
      headers["content-type"] = "application/json";
    }

    const res = await fetch(`${base}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new GameArenaPartnerApiError(res.status, body);
    }
    return body as T;
  }

  async function signControl(
    wallet: GoodAgentWalletAdapter,
    action: DeployControlAction,
    deployId: string,
  ): Promise<DeployControlAuth> {
    return signDeployControl(wallet, action, deployId);
  }

  async function resolveFirstDeployId(owner: string): Promise<string> {
    const data = await request<GameArenaPartnerAgentsResponse>(
      `/agents?${ownerQuery(owner)}`,
    );
    const deployId = data.agents[0]?.deployId;
    if (!deployId) {
      throw new GameArenaPartnerApiError(404, { error: "NO_AGENT", owner });
    }
    return deployId;
  }

  return {
    baseUrl: base,
    hostBaseUrl: hostBase,

    getAgents(owner: string) {
      return request<GameArenaPartnerAgentsResponse>(
        `/agents?${ownerQuery(owner)}`,
      );
    },

    getAgent(deployId: string) {
      return request<GameArenaPartnerAgent>(
        `/agents/${encodeURIComponent(deployId)}`,
      );
    },

    getSettingsSchema() {
      return request<GameArenaPartnerSettingsSchema>(`/settings/schema`);
    },

    getSettings(owner: string) {
      return request<GameArenaPartnerSettingsResponse>(
        `/settings?${ownerQuery(owner)}`,
      );
    },

    getSettingsByDeployId(deployId: string) {
      return request<Omit<GameArenaPartnerSettingsResponse, "owner">>(
        `/agents/${encodeURIComponent(deployId)}/settings`,
      );
    },

    async updateSettings(
      owner: string,
      wallet: GoodAgentWalletAdapter,
      configuration: GameArenaPartnerConfiguration,
    ) {
      const deployId = await resolveFirstDeployId(owner);
      const auth = await signControl(wallet, "configuration", deployId);
      return request<GameArenaPartnerUpdateSettingsResponse>(
        `/settings?${ownerQuery(owner)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ ...auth, configuration }),
        },
      );
    },

    async updateSettingsByDeployId(
      deployId: string,
      wallet: GoodAgentWalletAdapter,
      configuration: GameArenaPartnerConfiguration,
    ) {
      const auth = await signControl(wallet, "configuration", deployId);
      return request<GameArenaPartnerUpdateSettingsResponse>(
        `/agents/${encodeURIComponent(deployId)}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ ...auth, configuration }),
        },
      );
    },

    async start(deployId: string, wallet: GoodAgentWalletAdapter) {
      const auth = await signControl(wallet, "resume", deployId);
      return request<GameArenaPartnerControlResponse>(
        `/agents/${encodeURIComponent(deployId)}/start`,
        { method: "POST", body: JSON.stringify(auth) },
      );
    },

    async stop(deployId: string, wallet: GoodAgentWalletAdapter) {
      const auth = await signControl(wallet, "pause", deployId);
      return request<GameArenaPartnerControlResponse>(
        `/agents/${encodeURIComponent(deployId)}/stop`,
        { method: "POST", body: JSON.stringify(auth) },
      );
    },

    async play(owner: string, wallet: GoodAgentWalletAdapter) {
      const deployId = await resolveFirstDeployId(owner);
      const auth = await signControl(wallet, "play", deployId);
      return request<GameArenaPartnerPlayResponse>(`/play?${ownerQuery(owner)}`, {
        method: "POST",
        body: JSON.stringify(auth),
      });
    },

    async playByDeployId(deployId: string, wallet: GoodAgentWalletAdapter) {
      const auth = await signControl(wallet, "play", deployId);
      return request<GameArenaPartnerPlayResponse>(
        `/agents/${encodeURIComponent(deployId)}/play`,
        { method: "POST", body: JSON.stringify(auth) },
      );
    },

    getLive(owner: string) {
      return request<GameArenaPartnerLiveResponse>(`/live?${ownerQuery(owner)}`);
    },

    getLiveByDeployId(deployId: string) {
      return request<Omit<GameArenaPartnerLiveResponse, "owner">>(
        `/agents/${encodeURIComponent(deployId)}/live`,
      );
    },

    /** Host SSE proxy for spectators (`GET /host/arena/live/:matchId`). */
    arenaLiveSseUrl(matchId: string, hostBaseUrl = hostBase) {
      return `${normalizeBase(hostBaseUrl)}/arena/live/${encodeURIComponent(matchId)}`;
    },

    signControl,
  };
}

export type GameArenaPartnerClient = ReturnType<
  typeof createGameArenaPartnerClient
>;
