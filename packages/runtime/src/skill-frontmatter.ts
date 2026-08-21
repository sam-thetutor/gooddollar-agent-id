export interface SkillFrontmatter {
  name?: string;
  skill_id?: string;
  description?: string;
  version?: string;
  chain?: string;
  permissions?: Record<string, unknown>;
  required_env?: string[];
  contracts?: Array<{ name: string; address: string }>;
  verification?: string;
}

/** Parse YAML frontmatter from a SKILL.md file (between --- markers). */
export function parseSkillFrontmatter(markdown: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: markdown };
  }

  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: markdown };
  }

  const yamlBlock = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).replace(/^\n/, "");
  const frontmatter = parseSimpleYaml(yamlBlock) as SkillFrontmatter;
  return { frontmatter, body };
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let currentListKey: string | null = null;

  for (const rawLine of yaml.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const listMatch = line.match(/^\s*- (.+)$/);
    if (listMatch && currentListKey && !line.match(/^\s{2,}[a-zA-Z0-9_]+:/)) {
      const items = (out[currentListKey] as string[] | undefined) ?? [];
      items.push(stripQuotes(listMatch[1]!.trim()));
      out[currentListKey] = items;
      continue;
    }

    const topMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!topMatch) continue;

    const key = topMatch[1]!;
    const value = topMatch[2]!.trim();

    if (value === "") {
      if (key === "required_env") {
        currentListKey = key;
        out[key] = [];
      } else {
        currentListKey = null;
      }
      continue;
    }

    currentListKey = null;
    out[key] = stripQuotes(value);
  }

  return out;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
