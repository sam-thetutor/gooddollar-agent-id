import type { AgentManifest, SkillContext } from "@goodagent/skill-sdk";
import { createHostClient } from "./host-client.js";
import { createSkillScopedHostClient } from "./skill-host.js";
import { createRuntimeLogger } from "./logger.js";
import { loadSkillsFromManifest, type LoadedSkill } from "./loader.js";
import { createSkillWallet, readAgentPrivateKeyFromEnv } from "./wallet.js";

export interface AgentRuntimeOptions {
  manifestPath: string;
  manifest: AgentManifest;
  heartbeatIntervalMs?: number;
}

export class AgentRuntime {
  private readonly loaded: LoadedSkill[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;

  constructor(private readonly opts: AgentRuntimeOptions) {}

  async start(): Promise<void> {
    const { manifest, manifestPath } = this.opts;
    const privateKey = readAgentPrivateKeyFromEnv();
    if (!privateKey) {
      throw new Error(
        "AGENT_PRIVATE_KEY (or PRIVATE_KEY) is required for agent-runtime",
      );
    }

    const wallet = createSkillWallet(privateKey);
    if (wallet.address.toLowerCase() !== manifest.agentAddress.toLowerCase()) {
      throw new Error(
        `wallet address ${wallet.address} does not match manifest ${manifest.agentAddress}`,
      );
    }

    const host = createHostClient({
      deployId: manifest.deployId,
      hostUrl: manifest.host.url,
      hostSecret: manifest.host.secret,
    });

    const skills = await loadSkillsFromManifest(manifestPath, manifest.skills);
    this.loaded.push(...skills);

    for (const { manifest: skillManifest, plugin } of this.loaded) {
      const scopedHost = createSkillScopedHostClient(host, skillManifest.skillId);
      const ctx = this.buildContext(skillManifest.skillId, skillManifest.config, {
        wallet,
        host: scopedHost,
      });
      if (plugin.onLoad) await plugin.onLoad(ctx);
    }

    for (const { manifest: skillManifest, plugin } of this.loaded) {
      const scopedHost = createSkillScopedHostClient(host, skillManifest.skillId);
      const ctx = this.buildContext(skillManifest.skillId, skillManifest.config, {
        wallet,
        host: scopedHost,
      });
      if (plugin.onStart) await plugin.onStart(ctx);
    }

    await host.heartbeat();
    this.startHeartbeat(host, this.opts.heartbeatIntervalMs ?? 60_000);
    console.log(
      `[runtime] started deploy=${manifest.deployId} skills=${this.loaded.map((s) => s.manifest.skillId).join(",")}`,
    );
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    const privateKey = readAgentPrivateKeyFromEnv();
    if (!privateKey) return;
    const wallet = createSkillWallet(privateKey);
    const host = createHostClient({
      deployId: this.opts.manifest.deployId,
      hostUrl: this.opts.manifest.host.url,
      hostSecret: this.opts.manifest.host.secret,
    });

    for (const { manifest: skillManifest, plugin } of [...this.loaded].reverse()) {
      if (!plugin.onStop) continue;
      const ctx = this.buildContext(skillManifest.skillId, skillManifest.config, {
        wallet,
        host,
      });
      await plugin.onStop(ctx);
    }
  }

  private buildContext(
    skillId: string,
    config: Record<string, string>,
    deps: Pick<SkillContext, "wallet" | "host">,
  ): SkillContext {
    const { manifest } = this.opts;
    return {
      skillId,
      deployId: manifest.deployId,
      displayName: manifest.displayName,
      config,
      rpcUrl: manifest.rpcUrl,
      apiBase: manifest.apiBase,
      wallet: deps.wallet,
      host: deps.host,
      logger: createRuntimeLogger(skillId),
    };
  }

  private startHeartbeat(
    host: SkillContext["host"],
    intervalMs: number,
  ): void {
    this.heartbeatTimer = setInterval(() => {
      host.heartbeat().catch((err) => {
        console.error("[runtime] heartbeat failed", err);
      });
    }, intervalMs);
    this.heartbeatTimer.unref?.();
  }
}

export async function runAgentRuntime(
  manifestPath: string,
  manifest: AgentManifest,
): Promise<AgentRuntime> {
  const runtime = new AgentRuntime({ manifestPath, manifest });
  await runtime.start();
  return runtime;
}
