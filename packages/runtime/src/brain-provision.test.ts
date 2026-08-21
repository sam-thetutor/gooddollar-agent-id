import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  brainPm2Name,
  buildBrainPersona,
  provisionBrain,
  validateTelegramBotToken,
} from "./brain-provision.js";

const tempDirs: string[] = [];

function makeAgentsRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "brain-provision-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("buildBrainPersona", () => {
  it("gaming preset includes skills, no-model-leak and plain-text rules", () => {
    const persona = buildBrainPersona({
      displayName: "My ACTION-ORDER Agent",
      agentAddress: "0x85C53da868750F657D0280Be92b7350dB1292b09",
      template: "gaming",
      skills: [
        { skillId: "gaming/wagering/gamearena_1v1" },
        { skillId: "gaming/card-fighter/actionorder_vshouse" },
      ],
      tools: ["verify_address", "check_claim_eligibility", "agent_stats"],
    });
    expect(persona).toContain("My ACTION-ORDER Agent");
    expect(persona).toContain("0x85C53da868750F657D0280Be92b7350dB1292b09");
    expect(persona).toContain("GameArena 1v1");
    expect(persona).toContain("ActionOrder vs-house");
    expect(persona).toContain("Never introduce yourself as the underlying AI model");
    expect(persona).toContain("Plain text only");
    expect(persona).toContain("agent_stats");
    expect(persona).toContain("Reply in English by default");
  });

  it("omits the agent_stats rule when the tool is not enabled", () => {
    const persona = buildBrainPersona({
      displayName: "Bot",
      agentAddress: "0xabc",
      template: "social",
      skills: [],
      tools: ["verify_address"],
    });
    expect(persona).not.toContain("agent_stats");
  });

  it("falls back to a generic skill line for unknown skills", () => {
    const persona = buildBrainPersona({
      displayName: "Bot",
      agentAddress: "0xabc",
      template: "gaming",
      skills: [{ skillId: "custom/thing" }],
      tools: [],
    });
    expect(persona).toContain('Runs the "custom/thing" skill autonomously.');
  });
});

describe("provisionBrain", () => {
  it("writes persona, knowledge and brain-manifest.json and returns PM2 app", () => {
    const agentsRoot = makeAgentsRoot();
    const result = provisionBrain({
      deployId: "dep1",
      displayName: "My Agent",
      template: "gaming",
      agentAddress: "0xabc",
      agentsRoot,
      apiBase: "https://api.example",
      hostUrl: "http://127.0.0.1:3010/",
      skills: [{ skillId: "gaming/wagering/gamearena_1v1" }],
      settings: {
        model: "peer@deepseek-v4-flash",
        botToken: "123:token",
      },
    });

    expect(result.pm2Name).toBe("ga-brain-dep1");
    expect(existsSync(result.personaPath)).toBe(true);
    expect(existsSync(result.manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    expect(manifest.deployId).toBe("dep1");
    expect(manifest.brain.model).toBe("peer@deepseek-v4-flash");
    expect(manifest.brain.channels).toEqual(["telegram"]);
    expect(manifest.brain.tools).toEqual([
      "verify_address",
      "check_claim_eligibility",
      "agent_stats",
    ]);

    const agentDirPath = resolve(agentsRoot, "dep1");
    expect(
      existsSync(resolve(agentDirPath, "brain/knowledge/gooddollar-ubi.md")),
    ).toBe(true);
    expect(
      existsSync(resolve(agentDirPath, "brain/knowledge/scam-patterns.md")),
    ).toBe(true);

    expect(result.env.TELEGRAM_BOT_TOKEN).toBe("123:token");
    expect(result.env.GOODAGENT_HOST_URL).toBe("http://127.0.0.1:3010");
    expect(result.env.BRAIN_MEMORY_DIR).toBe(resolve(agentDirPath, "brain-memory"));
    expect(result.cliPath.endsWith("cli.js")).toBe(true);
  });

  it("respects custom tools and omits model when not set", () => {
    const agentsRoot = makeAgentsRoot();
    const result = provisionBrain({
      deployId: "dep2",
      displayName: "My Agent",
      template: "social",
      agentAddress: "0xabc",
      agentsRoot,
      apiBase: "https://api.example",
      hostUrl: "http://127.0.0.1:3010",
      skills: [],
      settings: { tools: ["verify_address"], botToken: "t" },
    });
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    expect(manifest.brain.model).toBeUndefined();
    expect(manifest.brain.tools).toEqual(["verify_address"]);
  });

  it("auto-enables amplify tools and queue env for the productclank skill", () => {
    const agentsRoot = makeAgentsRoot();
    const result = provisionBrain({
      deployId: "dep3",
      displayName: "My Agent",
      template: "social",
      agentAddress: "0xabc",
      agentsRoot,
      apiBase: "https://api.example",
      hostUrl: "http://127.0.0.1:3010",
      skills: [
        {
          skillId: "work/social/productclank_participant",
          configuration: { PRODUCTCLANK_API_KEY: "pck_live_test" },
        },
      ],
      settings: { botToken: "t" },
    });

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    expect(manifest.brain.tools).toContain("amplify_pending");
    expect(manifest.brain.tools).toContain("amplify_mark_posted");
    expect(manifest.brain.tools).toContain("amplify_feed");
    expect(manifest.brain.tools).toContain("amplify_campaigns");
    expect(manifest.brain.tools).toContain("amplify_campaign_drafts");
    expect(manifest.brain.tools).toContain("amplify_earnings");
    expect(result.env.AMPLIFY_QUEUE_FILE).toBe(
      resolve(agentsRoot, "dep3", "skills/productclank-participant/amplify-queue.json"),
    );
    expect(result.env.PRODUCTCLANK_API_KEY).toBe("pck_live_test");

    const persona = readFileSync(result.personaPath, "utf8");
    expect(persona).toContain("amplify_pending");
    expect(persona).toContain("amplify_campaigns");
    expect(persona).toContain("amplify_campaign_drafts");
    expect(persona).toContain("ProductClank Amplify participant");
  });

  it("skips the API-key amplify tools when no key is configured yet", () => {
    const agentsRoot = makeAgentsRoot();
    const result = provisionBrain({
      deployId: "dep4",
      displayName: "My Agent",
      template: "social",
      agentAddress: "0xabc",
      agentsRoot,
      apiBase: "https://api.example",
      hostUrl: "http://127.0.0.1:3010",
      skills: [{ skillId: "work/social/productclank_participant" }],
      settings: { botToken: "t" },
    });

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    expect(manifest.brain.tools).toContain("amplify_pending");
    expect(manifest.brain.tools).toContain("amplify_campaigns");
    expect(manifest.brain.tools).toContain("amplify_campaign_drafts");
    expect(manifest.brain.tools).not.toContain("amplify_feed");
    expect(manifest.brain.tools).not.toContain("amplify_earnings");
    expect(result.env.PRODUCTCLANK_API_KEY).toBeUndefined();
  });
});

describe("validateTelegramBotToken", () => {
  it("returns the bot username on success", async () => {
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { username: "my_bot" } }),
      }) as Response) as typeof fetch;
    await expect(validateTelegramBotToken("t", fetchImpl)).resolves.toBe("my_bot");
  });

  it("throws with the Telegram error description", async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({ ok: false, description: "Unauthorized" }),
      }) as Response) as typeof fetch;
    await expect(validateTelegramBotToken("bad", fetchImpl)).rejects.toThrow(
      /Unauthorized/,
    );
  });
});

describe("brainPm2Name", () => {
  it("prefixes ga-brain-", () => {
    expect(brainPm2Name("x")).toBe("ga-brain-x");
  });
});
