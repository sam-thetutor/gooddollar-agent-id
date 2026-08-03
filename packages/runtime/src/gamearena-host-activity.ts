import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseDotEnv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

export function loadSkillDirEnv(skillDir: string): Record<string, string> {
  const envPath = resolve(skillDir, ".env");
  if (!existsSync(envPath)) return {};
  try {
    return parseDotEnv(readFileSync(envPath, "utf8"));
  } catch {
    return {};
  }
}

/** Post skill/throw-worker events to the host activity endpoint (best-effort). */
export async function postDeployActivity(
  skillDir: string,
  body: Record<string, unknown>,
): Promise<void> {
  const env = loadSkillDirEnv(skillDir);
  const hostUrl = env.GOODAGENT_HOST_URL?.trim()?.replace(/\/$/, "");
  const secret = env.HOST_INTERNAL_SECRET?.trim();
  const deployId = env.DEPLOY_ID?.trim();
  if (!hostUrl || !secret || !deployId) return;

  try {
    const res = await fetch(
      `${hostUrl}/deploy/${encodeURIComponent(deployId)}/activity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[throws] host activity ${body.type} failed: HTTP ${res.status}${text ? ` ${text.slice(0, 120)}` : ""}`,
      );
    }
  } catch (err) {
    console.warn("[throws] host activity post failed:", err);
  }
}
