import { describe, expect, it, vi, beforeEach } from "vitest";
import { createSkillsRoutes, resetSkillsRouteCacheForTests, skillsWellKnownPayload } from "./skills.js";
import { parseSkillFrontmatter } from "@goodagent/runtime/external-skills";

const mockRegistry = {
  version: 1,
  skills: [
    {
      name: "gamearena-player",
      skill_id: "gaming/wagering/gamearena_1v1",
      path: "skills/gamearena-player",
      description: "Play GameArena",
      chain: "celo:42220",
      spends_tokens: false,
      listed: true,
    },
  ],
};

vi.mock("@goodagent/runtime/external-skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@goodagent/runtime/external-skills")>();
  return {
    ...actual,
    fetchSkillsRegistry: vi.fn(async () => mockRegistry),
    fetchSkillMarkdown: vi.fn(async () => `---
name: gamearena-player
version: 1.0.0
required_env:
  - PRIVATE_KEY
---
# GameArena
`),
    fetchSkillEnvExample: vi.fn(async () => "PRIVATE_KEY=\n"),
  };
});

describe("skills routes", () => {
  const app = createSkillsRoutes();

  beforeEach(() => {
    vi.clearAllMocks();
    resetSkillsRouteCacheForTests();
  });

  it("lists skills", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      skills: Array<{ skill_id: string }>;
    };
    expect(body.skills[0].skill_id).toBe("gaming/wagering/gamearena_1v1");
  });

  it("parses mock SKILL.md frontmatter", () => {
    const md = `---
name: gamearena-player
version: 1.0.0
required_env:
  - PRIVATE_KEY
---
# GameArena
`;
    expect(parseSkillFrontmatter(md).frontmatter.required_env).toEqual(["PRIVATE_KEY"]);
  });

  it("returns install manifest for a skill", async () => {
    const res = await app.request("/gaming/wagering/gamearena_1v1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      verification_required: boolean;
      install: { required_env: string[] };
      mcp: string;
    };
    expect(body.verification_required).toBe(false);
    expect(body.install.required_env).toEqual(["PRIVATE_KEY"]);
    expect(body.mcp).toContain("@goodagent/mcp-server");
  });

  it("returns skill.md as markdown", async () => {
    const res = await app.request("/gaming/wagering/gamearena_1v1/skill.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("# GameArena");
  });

  it("well-known payload marks local install", () => {
    const payload = skillsWellKnownPayload();
    expect(payload.install_mode).toBe("local");
    expect(payload.verification_required).toBe(false);
  });
});
