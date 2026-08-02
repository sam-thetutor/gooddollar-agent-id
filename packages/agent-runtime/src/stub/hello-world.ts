import {
  SKILL_API_VERSION,
  type GoodAgentSkill,
} from "@goodagent/skill-sdk";

const HEARTBEAT_MS = Number(process.env.HELLO_HEARTBEAT_MS ?? 30_000);

const skill: GoodAgentSkill = {
  id: "dev/hello-world",
  apiVersion: SKILL_API_VERSION,
  async onStart(ctx) {
    ctx.logger.info("hello-world plugin running", {
      deployId: ctx.deployId,
      address: ctx.wallet.address,
    });
    setInterval(() => {
      ctx.host.heartbeat().catch((err) => {
        ctx.logger.warn("hello-world heartbeat failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, HEARTBEAT_MS).unref?.();
  },
  async onStop(ctx) {
    ctx.logger.info("hello-world plugin stopped");
  },
};

export default skill;
