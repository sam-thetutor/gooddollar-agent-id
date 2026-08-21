import {
  buildInstallManifest,
  defaultLocalInstallDir,
  fetchSkillMarkdown,
  fetchSkillsRegistry,
  findRegistrySkill,
  installSkillLocally,
  parseSkillFrontmatter,
  searchRegistrySkills,
} from "@goodagent/runtime/external-skills";
import { filterListedSkills } from "@goodagent/shared";
import { resolve } from "node:path";
import { AgentIdError } from "@goodagent/shared";

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(error: unknown) {
  const code = error instanceof AgentIdError ? error.code : "UNKNOWN";
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }, null, 2) }],
    isError: true,
  };
}

function requireSkillId(args: Record<string, unknown> | undefined): string {
  const skillId = args?.skill_id;
  if (typeof skillId !== "string" || skillId.trim().length === 0) {
    throw new AgentIdError("Missing required 'skill_id' argument.", "BAD_INPUT");
  }
  return skillId.trim();
}

export const skillMcpTools = [
  {
    name: "goodagent_list_skills",
    description:
      "List skills from the GoodAgent public registry. External agents install locally — no hosted deploy or verification required.",
    inputSchema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Optional chain filter, e.g. celo:42220",
        },
        listed_only: {
          type: "boolean",
          description: "When true (default), hide unlisted skills.",
        },
      },
    },
  },
  {
    name: "goodagent_search_skills",
    description: "Search GoodAgent skills by name, skill_id, description, or game.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text." },
        listed_only: {
          type: "boolean",
          description: "When true (default), hide unlisted skills.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "goodagent_describe_skill",
    description:
      "Get full install metadata for one skill: env vars, permissions, repo path, and API URLs. verification_required is always false for local install.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "OASF-style skill id." },
      },
      required: ["skill_id"],
    },
  },
  {
    name: "goodagent_fetch_skill_md",
    description:
      "Fetch the raw SKILL.md instructions for an agent to read and follow locally.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "OASF-style skill id." },
      },
      required: ["skill_id"],
    },
  },
  {
    name: "goodagent_install_skill",
    description:
      "Install a GoodAgent skill locally: clone the skill folder, copy to target_dir, and run npm install. Does not deploy to GoodAgent VPS.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "OASF-style skill id." },
        target_dir: {
          type: "string",
          description:
            "Directory to install into. Defaults to ./skills/<skill-name> under the current working directory.",
        },
        skip_npm: {
          type: "boolean",
          description: "When true, copy files only (skip npm ci/install).",
        },
      },
      required: ["skill_id"],
    },
  },
] as const;

export async function handleSkillMcpTool(
  name: string,
  args: Record<string, unknown> | undefined,
) {
  switch (name) {
    case "goodagent_list_skills": {
      const registry = await fetchSkillsRegistry();
      const listedOnly = args?.listed_only !== false;
      const chain =
        typeof args?.chain === "string" ? args.chain.trim() : undefined;
      let skills = listedOnly
        ? filterListedSkills(registry.skills)
        : registry.skills;
      if (chain) {
        skills = skills.filter((s) => s.chain === chain);
      }
      return jsonResult({
        version: registry.version,
        count: skills.length,
        skills: skills.map((s) => ({
          skill_id: s.skill_id,
          name: s.name,
          description: s.description,
          chain: s.chain,
          spends_tokens: s.spends_tokens,
        })),
      });
    }
    case "goodagent_search_skills": {
      const query = args?.query;
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new AgentIdError("Missing required 'query' argument.", "BAD_INPUT");
      }
      const registry = await fetchSkillsRegistry();
      const listedOnly = args?.listed_only !== false;
      const skills = searchRegistrySkills(registry, query, { listedOnly });
      return jsonResult({
        query,
        count: skills.length,
        skills: skills.map((s) => ({
          skill_id: s.skill_id,
          name: s.name,
          description: s.description,
        })),
      });
    }
    case "goodagent_describe_skill": {
      const skillId = requireSkillId(args);
      const registry = await fetchSkillsRegistry();
      const skill = findRegistrySkill(registry, skillId);
      if (!skill) {
        throw new AgentIdError(`Skill not found: ${skillId}`, "NOT_FOUND");
      }
      let frontmatter: ReturnType<typeof parseSkillFrontmatter>["frontmatter"] = {};
      try {
        const md = await fetchSkillMarkdown(skill);
        frontmatter = parseSkillFrontmatter(md).frontmatter;
      } catch {
        // Manifest still useful without SKILL.md.
      }
      const manifest = buildInstallManifest(skill, {
        version: typeof frontmatter.version === "string" ? frontmatter.version : undefined,
        required_env: frontmatter.required_env,
      });
      return jsonResult({
        ...skill,
        verification_required: false,
        install: manifest.install,
        urls: manifest.urls,
      });
    }
    case "goodagent_fetch_skill_md": {
      const skillId = requireSkillId(args);
      const registry = await fetchSkillsRegistry();
      const skill = findRegistrySkill(registry, skillId);
      if (!skill) {
        throw new AgentIdError(`Skill not found: ${skillId}`, "NOT_FOUND");
      }
      const markdown = await fetchSkillMarkdown(skill);
      return {
        content: [{ type: "text" as const, text: markdown }],
      };
    }
    case "goodagent_install_skill": {
      const skillId = requireSkillId(args);
      const registry = await fetchSkillsRegistry();
      const skill = findRegistrySkill(registry, skillId);
      if (!skill) {
        throw new AgentIdError(`Skill not found: ${skillId}`, "NOT_FOUND");
      }
      const targetDir =
        typeof args?.target_dir === "string" && args.target_dir.trim().length > 0
          ? resolve(args.target_dir.trim())
          : defaultLocalInstallDir(process.cwd(), skill);
      const result = installSkillLocally({
        skill,
        targetDir,
        skipNpm: args?.skip_npm === true,
        quiet: true,
      });
      return jsonResult({
        ok: true,
        verification_required: false,
        ...result,
        next_steps: [
          `cd ${result.targetDir}`,
          "cp .env.example .env  # if present, then fill in values",
          "npm start",
        ],
      });
    }
    default:
      return null;
  }
}

export { errorResult as skillErrorResult };
