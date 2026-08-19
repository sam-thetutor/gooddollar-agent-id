import type { ChessArenaPartnerConfigField } from "@goodagent/shared";
import { GOODAGENT_HOST_URL } from "../public-urls.js";
import type { DeployControlAction } from "../deploy-auth.js";
import type { GoodAgentWalletAdapter } from "../types.js";
import {
  signDeployControl,
  type DeployControlAuth,
} from "./host.js";

export type ChessArenaPartnerConfiguration = Record<string, string>;

export interface ChessArenaPartnerAgent {
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
  activeMatchId: string | null;
  livePhase: "starting" | "playing" | null;
  liveWatchUrl: string | null;
  pollUrl: string | null;
  configuration: ChessArenaPartnerConfiguration;
}

export interface ChessArenaPartnerAgentsResponse {
  owner: string;
  agents: ChessArenaPartnerAgent[];
}

export interface ChessArenaPartnerSettingsResponse {
  owner?: string;
  deployId: string;
  verified: boolean;
  configuration: ChessArenaPartnerConfiguration;
}

export interface ChessArenaPartnerSettingsSchema {
  skillId: string;
  fields: ChessArenaPartnerConfigField[];
}

export interface ChessArenaPartnerUpdateSettingsResponse {
  owner?: string;
  deployId: string;
  configuration: ChessArenaPartnerConfiguration;
  restarted: boolean;
}

export interface ChessArenaPartnerPlayResponse {
  deployId: string;
  agentAddress: string | null;
  matchId: string;
  tournamentId: number | null;
  livePhase: "starting";
  liveWatchUrl: string | null;
  pollUrl: string;
}

export interface ChessArenaPartnerLiveResponse {
  owner?: string;
  deployId: string;
  activeMatchId: string | null;
  livePhase: "starting" | "playing" | null;
  liveWatchUrl: string | null;
  pollUrl: string | null;
}

export interface ChessArenaPartnerRecordMatchResponse {
  ok: boolean;
  deployId: string;
  matchId: string;
  tournamentId: number | null;
}

export interface ChessArenaPartnerAgentRegistryEntry {
  agentAddress: string;
  deployId: string;
  displayName: string;
  ownerWallet: string | null;
  status: string;
  verified: boolean;
  deployedAt: string | null;
}

export interface ChessArenaPartnerAgentAddressesResponse {
  page: number;
  pageSize: number;
  total: number;
  agents: ChessArenaPartnerAgentRegistryEntry[];
}

export interface ChessArenaPartnerIsAgentResponse {
  isAgent: boolean;
  agentAddress: string;
  deployId?: string;
  displayName?: string;
  ownerWallet?: string | null;
  status?: string;
  verified?: boolean;
  deployedAt?: string | null;
}

export class ChessArenaPartnerApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const record = body as { error?: string; message?: string };
    super(record.message ?? record.error ?? `Chess Arena partner API ${status}`);
    this.name = "ChessArenaPartnerApiError";
    this.status = status;
    this.code = record.error;
    this.body = body;
  }
}

export interface ChessArenaPartnerClientOptions {
  /** GoodAgent host base, e.g. `https://goodagentids.xyz/host`. */
  hostBaseUrl?: string;
  /** Sent as `x-partner-key` when the host sets `CHESS_ARENA_PARTNER_API_KEY`. */
  partnerKey?: string;
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

function ownerQuery(owner: string): string {
  return `owner=${encodeURIComponent(owner)}`;
}

export function createChessArenaPartnerClient(
  options: ChessArenaPartnerClientOptions = {},
) {
  const hostBase = normalizeBase(options.hostBaseUrl ?? GOODAGENT_HOST_URL);
  const base = `${hostBase}/partners/chess-arena`;

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
      throw new ChessArenaPartnerApiError(res.status, body);
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
    const data = await request<ChessArenaPartnerAgentsResponse>(
      `/agents?${ownerQuery(owner)}`,
    );
    const deployId = data.agents[0]?.deployId;
    if (!deployId) {
      throw new ChessArenaPartnerApiError(404, { error: "NO_AGENT", owner });
    }
    return deployId;
  }

  return {
    baseUrl: base,
    hostBaseUrl: hostBase,

    getAgents(owner: string) {
      return request<ChessArenaPartnerAgentsResponse>(
        `/agents?${ownerQuery(owner)}`,
      );
    },

    getAgent(deployId: string) {
      return request<ChessArenaPartnerAgent>(
        `/agents/${encodeURIComponent(deployId)}`,
      );
    },

    getSettingsSchema() {
      return request<ChessArenaPartnerSettingsSchema>(`/settings/schema`);
    },

    getSettings(owner: string) {
      return request<ChessArenaPartnerSettingsResponse>(
        `/settings?${ownerQuery(owner)}`,
      );
    },

    getSettingsByDeployId(deployId: string) {
      return request<ChessArenaPartnerSettingsResponse>(
        `/agents/${encodeURIComponent(deployId)}/settings`,
      );
    },

    async updateSettings(
      owner: string,
      wallet: GoodAgentWalletAdapter,
      configuration: ChessArenaPartnerConfiguration,
    ) {
      const deployId = await resolveFirstDeployId(owner);
      const auth = await signControl(wallet, "configuration", deployId);
      return request<ChessArenaPartnerUpdateSettingsResponse>(
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
      configuration: ChessArenaPartnerConfiguration,
    ) {
      const auth = await signControl(wallet, "configuration", deployId);
      return request<ChessArenaPartnerUpdateSettingsResponse>(
        `/agents/${encodeURIComponent(deployId)}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ ...auth, configuration }),
        },
      );
    },

    async play(owner: string, wallet: GoodAgentWalletAdapter) {
      const deployId = await resolveFirstDeployId(owner);
      const auth = await signControl(wallet, "play", deployId);
      return request<ChessArenaPartnerPlayResponse>(`/play?${ownerQuery(owner)}`, {
        method: "POST",
        body: JSON.stringify(auth),
      });
    },

    async playByDeployId(deployId: string, wallet: GoodAgentWalletAdapter) {
      const auth = await signControl(wallet, "play", deployId);
      return request<ChessArenaPartnerPlayResponse>(
        `/agents/${encodeURIComponent(deployId)}/play`,
        { method: "POST", body: JSON.stringify(auth) },
      );
    },

    getLive(owner: string, deployId?: string) {
      const q = deployId
        ? `${ownerQuery(owner)}&deployId=${encodeURIComponent(deployId)}`
        : ownerQuery(owner);
      return request<ChessArenaPartnerLiveResponse>(`/live?${q}`);
    },

    async recordMatch(
      deployId: string,
      wallet: GoodAgentWalletAdapter,
      body: {
        matchId: string;
        result: "won" | "lost";
        puzzlesSolved?: number;
        ratingSum?: number;
        at?: string;
      },
    ) {
      const auth = await signControl(wallet, "play", deployId);
      return request<ChessArenaPartnerRecordMatchResponse>(
        `/agents/${encodeURIComponent(deployId)}/record-match`,
        {
          method: "POST",
          body: JSON.stringify({ ...auth, ...body }),
        },
      );
    },

    getAgentAddresses(page = 1, pageSize = 100, verifiedOnly = false) {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (verifiedOnly) q.set("verified", "1");
      return request<ChessArenaPartnerAgentAddressesResponse>(
        `/agent-addresses?${q.toString()}`,
      );
    },

    isAgent(address: string) {
      return request<ChessArenaPartnerIsAgentResponse>(
        `/is-agent?address=${encodeURIComponent(address)}`,
      );
    },

    signControl,
  };
}

export type ChessArenaPartnerClient = ReturnType<
  typeof createChessArenaPartnerClient
>;
