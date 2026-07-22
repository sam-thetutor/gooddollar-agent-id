import type { DeployControlAuth } from "@goodagent/shared";
import {
  buildDeployControlMessage,
  type DeployControlAction,
} from "@goodagent/shared";
import type { GoodAgentWalletAdapter } from "../types.js";
import type { SkillConfiguration } from "../types.js";
import type { DeployTemplate } from "../skill-config.js";

export type { DeployControlAction, DeployControlAuth };

export interface DeployAgent {
  id: string;
  displayName: string;
  status: string;
  agentAddress: string | null;
  ownerWallet: string | null;
  lastError: string | null;
}

export interface DeployStatusResponse {
  id: string;
  displayName?: string;
  status: string;
  ownerWallet?: string | null;
  agentAddress: string | null;
  lastError: string | null;
  pipelineRunning: boolean;
  verify: {
    valid?: boolean;
    agentProven?: boolean;
    reason?: string;
  } | null;
  stats?: {
    performance?: {
      gamesPlayed: number;
      wins: number;
      losses: number;
      summary: string | null;
      matchesToday: number;
    } | null;
    balances?: {
      gDollarFormatted: string;
      celoFormatted: string;
    } | null;
    logTail?: string | null;
  } | null;
  pm2?: {
    status: string;
    online: boolean;
    uptimeMs?: number;
    restarts?: number;
    memoryMb?: number;
  } | null;
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

async function hostFetch<T>(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (method !== "GET" && method !== "HEAD" && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(`${normalizeBase(base)}${path}`, {
    ...init,
    headers,
  });
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

export function createHostClient(hostBaseUrl: string) {
  const base = normalizeBase(hostBaseUrl);

  return {
    createDeploy(input: {
      displayName: string;
      ownerWallet: string;
      skillId: string;
      configuration?: SkillConfiguration;
      partnerId?: string;
      template?: DeployTemplate;
      telegramBotToken?: string;
    }) {
      return hostFetch<{ agent: DeployAgent }>(base, "/deploy", {
        method: "POST",
        body: JSON.stringify({
          displayName: input.displayName,
          ownerWallet: input.ownerWallet,
          skillId: input.skillId,
          configuration: input.configuration,
          template: input.template ?? "gaming",
          skipPayment: true,
          ...(input.partnerId ? { referrer: input.partnerId } : {}),
          ...(input.telegramBotToken
            ? { telegramBotToken: input.telegramBotToken }
            : {}),
        }),
      });
    },

    runDeployPipeline(deployId: string, auth: DeployControlAuth) {
      return hostFetch<{ accepted: boolean; deployId: string }>(
        base,
        `/deploy/${deployId}/run-pipeline`,
        { method: "POST", body: JSON.stringify(auth) },
      );
    },

    getDeployStatus(deployId: string) {
      return hostFetch<DeployStatusResponse>(base, `/deploy/${deployId}/status`);
    },

    startDeploy(deployId: string, auth: DeployControlAuth) {
      return hostFetch<{ agent: DeployAgent }>(base, `/deploy/${deployId}/start`, {
        method: "POST",
        body: JSON.stringify(auth),
      });
    },

    stopDeploy(deployId: string, auth: DeployControlAuth) {
      return hostFetch<{ agent: DeployAgent }>(base, `/deploy/${deployId}/stop`, {
        method: "POST",
        body: JSON.stringify(auth),
      });
    },

    listByOwner(ownerWallet: string) {
      return hostFetch<{ agents: DeployAgent[] }>(
        base,
        `/deploy?ownerWallet=${encodeURIComponent(ownerWallet)}`,
      );
    },
  };
}

export type HostClient = ReturnType<typeof createHostClient>;

export async function signDeployControl(
  wallet: GoodAgentWalletAdapter,
  action: DeployControlAction,
  deployId: string,
): Promise<DeployControlAuth> {
  if (!wallet.address) throw new Error("Wallet not connected");
  const issuedAt = Date.now();
  const message = buildDeployControlMessage(action, deployId, issuedAt);
  const signature = await wallet.signMessage(message);
  return { ownerWallet: wallet.address, signature, issuedAt };
}

export function isDeployOwner(
  connected: string | undefined,
  ownerWallet: string | null | undefined,
): boolean {
  if (!connected || !ownerWallet) return false;
  return connected.toLowerCase() === ownerWallet.toLowerCase();
}

export function deployNeedsUserVouch(
  status: DeployStatusResponse | null | undefined,
): boolean {
  if (!status?.agentAddress) return false;
  if (status.pipelineRunning) return false;
  if (status.status === "failed" || status.status === "running") return false;
  if (status.verify?.valid === true) return false;
  return status.status === "awaiting_vouch" || status.status === "starting";
}
