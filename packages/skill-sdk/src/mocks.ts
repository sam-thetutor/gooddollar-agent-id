import type {
  GoodAgentSkill,
  HostClient,
  SkillContext,
  SkillLogger,
  SkillWallet,
} from "./types.js";
import { SKILL_API_VERSION } from "./types.js";

export function createMockLogger(): SkillLogger & { entries: string[] } {
  const entries: string[] = [];
  const log =
    (level: string) =>
    (message: string, meta?: Record<string, unknown>) => {
      entries.push(
        meta ? `[${level}] ${message} ${JSON.stringify(meta)}` : `[${level}] ${message}`,
      );
    };
  return {
    entries,
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
  };
}

export function createMockWallet(
  address: SkillWallet["address"] = "0x0000000000000000000000000000000000000001",
): SkillWallet & { signed: string[] } {
  const signed: string[] = [];
  return {
    address,
    signed,
    async signMessage(message) {
      const text =
        typeof message === "string" ? message : Buffer.from(message).toString("hex");
      signed.push(text);
      return "0x" + "ab".repeat(32) as `0x${string}`;
    },
  };
}

export function createMockHost(): HostClient & {
  heartbeats: number;
  activities: unknown[];
} {
  const activities: unknown[] = [];
  return {
    heartbeats: 0,
    activities,
    async heartbeat() {
      this.heartbeats += 1;
    },
    async reportActivity(event) {
      activities.push(event);
    },
  };
}

export function createMockSkillContext(
  overrides: Partial<SkillContext> = {},
): SkillContext {
  const logger = createMockLogger();
  return {
    skillId: "dev/mock",
    deployId: "mock-deploy",
    displayName: "Mock Agent",
    config: {},
    rpcUrl: "https://forno.celo.org",
    apiBase: "https://goodagentids.xyz",
    wallet: createMockWallet(),
    host: createMockHost(),
    logger,
    ...overrides,
  };
}

export function createStubSkill(
  id = "dev/hello-world",
): GoodAgentSkill & { started: boolean; stopped: boolean } {
  let started = false;
  let stopped = false;
  return {
    id,
    apiVersion: SKILL_API_VERSION,
    get started() {
      return started;
    },
    get stopped() {
      return stopped;
    },
    async onStart(ctx) {
      started = true;
      ctx.logger.info(`${id} started`);
    },
    async onStop(ctx) {
      stopped = true;
      ctx.logger.info(`${id} stopped`);
    },
  };
}
