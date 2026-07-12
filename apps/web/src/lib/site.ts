/** Canonical public site origin (production). */
export const SITE_ORIGIN = "https://goodagentids.xyz";

/** API base (production). */
export const API_ORIGIN = "https://gcopilot-api.geinz.lol";

/** Autonomous deploy host API (production). */
export const HOST_ORIGIN = "https://gcopilot-api.geinz.lol/host";

/**
 * Canonical demo agent — attested on Celo mainnet; operators vouch at /issue.
 * Private key lives in apps/api/.test-agent.json (local only, gitignored).
 */
export const DEMO_AGENT_ADDRESS =
  "0xBd4495328ac79B2E4A4B488Eb0D4b3548833Ad2A" as const;

export const DEMO_AGENT_NAME = "GoodAgent Demo";
