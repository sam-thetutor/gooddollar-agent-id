/** Canonical public GoodAgent site (SPA + nginx proxies). */
export const GOODAGENT_SITE_ORIGIN = "https://goodagentids.xyz";

/** Main API — wallet, issue, verify, explore. */
export const GOODAGENT_API_URL = `${GOODAGENT_SITE_ORIGIN}/api`;

/** Autonomous deploy host — create deploy, pipeline, start/stop. */
export const GOODAGENT_HOST_URL = `${GOODAGENT_SITE_ORIGIN}/host`;

/** Celo mainnet — Agent ID signatures and on-chain vouch. */
export const CELO_CHAIN_ID = 42220 as const;
