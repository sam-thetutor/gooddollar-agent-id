/** Canonical public GoodAgent site (SPA + nginx proxies). */
export const GOODAGENT_SITE_ORIGIN = "https://goodagentids.xyz";

/** Main API — wallet, issue, verify, explore. */
export const GOODAGENT_API_URL = `${GOODAGENT_SITE_ORIGIN}/api`;

/** Autonomous deploy host — create deploy, pipeline, start/stop. */
export const GOODAGENT_HOST_URL = `${GOODAGENT_SITE_ORIGIN}/host`;

/**
 * Legacy hostname (same VPS backends). Prefer GOODAGENT_* URLs for partners and docs.
 * Kept for backward compatibility during migration.
 */
export const LEGACY_API_ORIGIN = "https://gcopilot-api.geinz.lol";

export const LEGACY_HOST_ORIGIN = `${LEGACY_API_ORIGIN}/host`;
