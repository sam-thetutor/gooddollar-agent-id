/** Parse deploy skill configuration JSON stored on the agent record. */
export function parseSkillConfig(raw?: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}
