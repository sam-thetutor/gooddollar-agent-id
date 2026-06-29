export const CELO_CHAIN_ID = 42220 as const;

export const GOODDOLLAR_ENVIRONMENTS = ["production", "development"] as const;
export type GoodDollarEnv = (typeof GOODDOLLAR_ENVIRONMENTS)[number];

export const G_DOLLAR_DECIMALS = 18;

/** Default max transfer amount in G$ (Phase 6) */
export const DEFAULT_MAX_TRANSFER_G = 1000;

/** Pending action TTL in minutes */
export const PENDING_ACTION_TTL_MINUTES = 15;
