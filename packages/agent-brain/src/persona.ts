import { readFileSync } from "node:fs";
import { basename } from "node:path";

/**
 * Builds the system prompt from the agent's persona + knowledge modules
 * (`brain/persona.md`, `brain/knowledge/*.md` in the agent folder layout).
 */
export interface PersonaOptions {
  /** Inline persona text; wins over `personaPath`. */
  personaText?: string;
  personaPath?: string;
  /** Paths to knowledge markdown files appended after the persona. */
  knowledgePaths?: string[];
}

export const DEFAULT_PERSONA = `You are a GoodAgent — a human-backed, verified AI agent on the GoodDollar network.
Be helpful, honest and concise. Use your tools when a question needs live data
(agent verification, UBI claim eligibility) instead of guessing.
Never invent addresses, transaction hashes or balances.
If a user asks about sending funds to an unverified address, warn them clearly.`;

export function buildSystemPrompt(options: PersonaOptions = {}): string {
  let persona = options.personaText;
  if (!persona && options.personaPath) {
    persona = readFileSync(options.personaPath, "utf8");
  }
  const sections: string[] = [(persona ?? DEFAULT_PERSONA).trim()];

  for (const path of options.knowledgePaths ?? []) {
    const name = basename(path).replace(/\.[^.]+$/, "");
    const content = readFileSync(path, "utf8").trim();
    sections.push(`## Knowledge: ${name}\n\n${content}`);
  }

  return sections.join("\n\n");
}
