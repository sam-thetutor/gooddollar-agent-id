/** Supported skill plugin API version. Bump only with breaking SDK changes. */
export const SKILL_API_VERSION = 1 as const;

export type SkillApiVersion = typeof SKILL_API_VERSION;

export type HexAddress = `0x${string}`;

export interface SkillLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Shared agent wallet exposed to skills through the runtime coordinator. */
export interface SkillWallet {
  readonly address: HexAddress;
  signMessage(message: string | Uint8Array): Promise<`0x${string}`>;
  signTypedData?(typedData: unknown): Promise<`0x${string}`>;
}

export interface SkillActivityEvent {
  type: string;
  /** Skill that produced this event (required for multi-skill deploys). */
  skillId?: string;
  matchId?: string;
  gameType?: number;
  wagerGs?: number;
  result?: "won" | "lost" | "unresolved";
  mode?: "offchain" | "onchain";
  at?: string;
  priceGs?: number;
  txHash?: string;
  message?: string;
  phase?: "starting" | "playing" | "ended";
  winsNeeded?: number;
  playerLabel?: string;
  round?: number;
}

/** Host API client injected into each skill context. */
export interface HostClient {
  heartbeat(): Promise<void>;
  reportActivity(event: SkillActivityEvent): Promise<void>;
}

/** Runtime context passed to skill lifecycle hooks. */
export interface SkillContext {
  skillId: string;
  deployId: string;
  displayName: string;
  config: Record<string, string>;
  rpcUrl: string;
  apiBase: string;
  wallet: SkillWallet;
  host: HostClient;
  logger: SkillLogger;
}

/** Contract every GoodAgent skill plugin must implement. */
export interface GoodAgentSkill {
  readonly id: string;
  readonly apiVersion: SkillApiVersion;
  onLoad?(ctx: SkillContext): Promise<void> | void;
  onStart?(ctx: SkillContext): Promise<void> | void;
  onStop?(ctx: SkillContext): Promise<void> | void;
  onConfigChange?(
    ctx: SkillContext,
    config: Record<string, string>,
  ): Promise<void> | void;
}

export function isGoodAgentSkill(value: unknown): value is GoodAgentSkill {
  if (!value || typeof value !== "object") return false;
  const skill = value as GoodAgentSkill;
  return (
    typeof skill.id === "string" &&
    skill.id.length > 0 &&
    skill.apiVersion === SKILL_API_VERSION
  );
}
