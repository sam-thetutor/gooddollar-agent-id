import type { GoodDollarEnv } from "@g-copilot/shared";
import { CELO_CHAIN_ID } from "@g-copilot/shared";

/** G$ token on Celo mainnet — verify at docs.gooddollar.org/for-developers/core-contracts */
export const G_DOLLAR_ADDRESS = {
  [CELO_CHAIN_ID]: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as const,
} as const;

/** GoodDollar Identity (sybil resistance) on Celo */
export const IDENTITY_ADDRESS = {
  [CELO_CHAIN_ID]: "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42" as const,
} as const;

/** GoodDollar UBIScheme on Celo */
export const UBI_SCHEME_ADDRESS = {
  [CELO_CHAIN_ID]: "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" as const,
} as const;

/** Superfluid CFA forwarder on Celo */
export const CFA_FORWARDER_ADDRESS = {
  [CELO_CHAIN_ID]: "0xcfA132E353cB4E398080B9700609bb008eceB125" as const,
} as const;

export function getGoodDollarEnv(): GoodDollarEnv {
  const env = process.env.GOODDOLLAR_ENV ?? "production";
  if (env === "development" || env === "production") {
    return env;
  }
  return "production";
}

export function getRpcUrl(): string {
  return process.env.CELO_RPC_URL ?? "https://forno.celo.org";
}
