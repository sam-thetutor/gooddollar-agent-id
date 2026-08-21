import { Hono } from "hono";
import { filterListedSkills } from "@goodagent/shared";
import {
  buildInstallManifest,
  fetchSkillEnvExample,
  fetchSkillMarkdown,
  fetchSkillsRegistry,
  findRegistrySkill,
  parseSkillFrontmatter,
  searchRegistrySkills,
  type SkillsRegistry,
} from "@goodagent/runtime/external-skills";

const REGISTRY_CACHE_TTL_MS = 5 * 60_000;
const SKILL_DOC_CACHE_TTL_MS = 15 * 60_000;

let registryCache: { at: number; body: SkillsRegistry } | null = null;
const skillMdCache = new Map<string, { at: number; body: string }>();
const skillEnvCache = new Map<string, { at: number; body: string | null }>();

async function getRegistry(): Promise<SkillsRegistry> {
  if (registryCache && Date.now() - registryCache.at < REGISTRY_CACHE_TTL_MS) {
    return registryCache.body;
  }
  const body = await fetchSkillsRegistry();
  registryCache = { at: Date.now(), body };
  return body;
}

async function getSkillMarkdown(skillId: string) {
  const cached = skillMdCache.get(skillId);
  if (cached && Date.now() - cached.at < SKILL_DOC_CACHE_TTL_MS) {
    return cached.body;
  }
  const registry = await getRegistry();
  const skill = findRegistrySkill(registry, skillId);
  if (!skill) return null;
  const body = await fetchSkillMarkdown(skill);
  skillMdCache.set(skillId, { at: Date.now(), body });
  return body;
}

function decodeSkillIdParam(raw: string): string {
  return raw
    .split("/")
    .map((part) => decodeURIComponent(part))
    .join("/");
}

function skillTail(c: {
  req: {
    url: string;
    path: string;
    param: (name: string) => string | undefined;
  };
}): string {
  const wild = c.req.param("*");
  if (wild) return decodeSkillIdParam(wild);

  const pathname = new URL(c.req.url).pathname;
  for (const marker of ["/api/v1/skills/", "/v1/skills/"]) {
    const idx = pathname.indexOf(marker);
    if (idx >= 0) {
      return decodeSkillIdParam(pathname.slice(idx + marker.length));
    }
  }

  return decodeSkillIdParam(c.req.path.replace(/^\//, ""));
}

/** @internal test helper */
export function resetSkillsRouteCacheForTests(): void {
  registryCache = null;
  skillMdCache.clear();
  skillEnvCache.clear();
}

/** Skills registry REST API for external agents (local install only). */
export function createSkillsRoutes(): Hono {
  const skills = new Hono();

  skills.get("/registry", async (c) => {
    const registry = await getRegistry();
    return c.json(registry);
  });

  skills.get("/", async (c) => {
    const registry = await getRegistry();
    const q = c.req.query("q")?.trim();
    const chain = c.req.query("chain")?.trim();
    const listedOnly = c.req.query("listed") !== "false";

    let items = q
      ? searchRegistrySkills(registry, q, { listedOnly })
      : listedOnly
        ? filterListedSkills(registry.skills)
        : registry.skills;

    if (chain) {
      items = items.filter((s) => s.chain === chain);
    }

    return c.json({
      version: registry.version,
      count: items.length,
      skills: items.map((s) => ({
        skill_id: s.skill_id,
        name: s.name,
        description: s.description,
        chain: s.chain,
        spends_tokens: s.spends_tokens,
        game: s.game ?? null,
        game_url: s.game_url ?? null,
        listed: s.listed !== false,
      })),
    });
  });

  skills.get("/*", async (c) => {
    const tail = skillTail(c);

    if (tail.endsWith("/skill.md")) {
      const skillId = decodeSkillIdParam(tail.slice(0, -"/skill.md".length));
      const registry = await getRegistry();
      const skill = findRegistrySkill(registry, skillId);
      if (!skill) {
        return c.json({ error: "SKILL_NOT_FOUND", skill_id: skillId }, 404);
      }
      try {
        const md = await getSkillMarkdown(skillId);
        if (!md) {
          return c.json({ error: "SKILL_MD_UNAVAILABLE" }, 502);
        }
        c.header("Content-Type", "text/markdown; charset=utf-8");
        c.header("Cache-Control", "public, max-age=900");
        return c.body(md);
      } catch (error) {
        console.error("skill.md fetch failed", skillId, error);
        return c.json({ error: "SKILL_MD_UNAVAILABLE" }, 502);
      }
    }

    if (tail.endsWith("/env.example")) {
      const skillId = decodeSkillIdParam(tail.slice(0, -"/env.example".length));
      const registry = await getRegistry();
      const skill = findRegistrySkill(registry, skillId);
      if (!skill) {
        return c.json({ error: "SKILL_NOT_FOUND", skill_id: skillId }, 404);
      }

      const cached = skillEnvCache.get(skillId);
      if (cached && Date.now() - cached.at < SKILL_DOC_CACHE_TTL_MS) {
        if (!cached.body) return c.json({ error: "ENV_EXAMPLE_NOT_FOUND" }, 404);
        c.header("Content-Type", "text/plain; charset=utf-8");
        return c.body(cached.body);
      }

      try {
        const body = await fetchSkillEnvExample(skill);
        skillEnvCache.set(skillId, { at: Date.now(), body });
        if (!body) return c.json({ error: "ENV_EXAMPLE_NOT_FOUND" }, 404);
        c.header("Content-Type", "text/plain; charset=utf-8");
        c.header("Cache-Control", "public, max-age=900");
        return c.body(body);
      } catch (error) {
        console.error("env.example fetch failed", skillId, error);
        return c.json({ error: "ENV_EXAMPLE_UNAVAILABLE" }, 502);
      }
    }

    const skillId = decodeSkillIdParam(tail);
    const registry = await getRegistry();
    const skill = findRegistrySkill(registry, skillId);
    if (!skill) {
      return c.json({ error: "SKILL_NOT_FOUND", skill_id: skillId }, 404);
    }

    let frontmatter: ReturnType<typeof parseSkillFrontmatter>["frontmatter"] = {};
    try {
      const md = await getSkillMarkdown(skillId);
      if (md) {
        frontmatter = parseSkillFrontmatter(md).frontmatter;
      }
    } catch {
      // Manifest still useful without SKILL.md.
    }

    const manifest = buildInstallManifest(skill, {
      version: typeof frontmatter.version === "string" ? frontmatter.version : undefined,
      required_env: frontmatter.required_env,
    });

    return c.json({
      ...skill,
      verification_required: false,
      install: manifest.install,
      urls: manifest.urls,
      mcp: "goodagent_describe_skill + goodagent_install_skill via @goodagent/mcp-server",
    });
  });

  return skills;
}

/** Machine-readable index for agent discovery. */
export function skillsWellKnownPayload() {
  return {
    name: "GoodAgent Skills",
    version: 1,
    registry_url: "https://goodagentids.xyz/api/v1/skills/registry",
    list_url: "https://goodagentids.xyz/api/v1/skills",
    mcp: "@goodagent/mcp-server",
    docs: "https://goodagentids.xyz/skills",
    install_mode: "local",
    verification_required: false,
  };
}
