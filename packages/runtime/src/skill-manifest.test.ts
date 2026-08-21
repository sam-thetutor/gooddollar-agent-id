import { describe, expect, it } from "vitest";
import { buildInstallManifest } from "./skill-manifest.js";
import { parseSkillFrontmatter } from "./skill-frontmatter.js";
import type { RegistrySkill } from "./registry.js";

describe("parseSkillFrontmatter", () => {
  it("parses required_env", () => {
    const md = `---
name: gamearena-player
version: 1.0.0
required_env:
  - PRIVATE_KEY
---
# GameArena
`;
    const { frontmatter, body } = parseSkillFrontmatter(md);
    expect(frontmatter.required_env).toEqual(["PRIVATE_KEY"]);
    expect(body.trim()).toBe("# GameArena");
  });
});

describe("buildInstallManifest", () => {
  it("sets verification_required false", () => {
    const skill: RegistrySkill = {
      name: "gamearena-player",
      skill_id: "gaming/wagering/gamearena_1v1",
      path: "skills/gamearena-player",
      description: "Play GameArena",
      chain: "celo:42220",
      spends_tokens: false,
    };
    const manifest = buildInstallManifest(skill, {
      version: "1.2.0",
      required_env: ["PRIVATE_KEY"],
    });
    expect(manifest.verification_required).toBe(false);
    expect(manifest.install.required_env).toEqual(["PRIVATE_KEY"]);
  });
});
