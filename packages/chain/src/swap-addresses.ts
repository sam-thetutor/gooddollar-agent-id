import { CELO_CHAIN_ID } from "@goodagent/shared";
import { G_DOLLAR_ADDRESS } from "./addresses.js";

/** Canonical Celo mainnet USDT (6 decimals) — arena.chesspuzzles.xyz stake token. */
export const CELO_USDT_ADDRESS = {
  [CELO_CHAIN_ID]: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as const,
} as const;

/** Mento USDm on Celo — GoodDollar reserve collateral (18 decimals). */
export const CELO_USDM_ADDRESS = {
  [CELO_CHAIN_ID]: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const,
} as const;

/** GoodDollar MentoBroker on Celo production. */
export const MENTO_BROKER_ADDRESS = {
  [CELO_CHAIN_ID]: "0x88de45906D4F5a57315c133620cfa484cB297541" as const,
} as const;

/** GoodDollarExchangeProvider on Celo production. */
export const MENTO_EXCHANGE_PROVIDER_ADDRESS = {
  [CELO_CHAIN_ID]: "0x2fFBB49055d487DdBBb0C052Cd7c2a02A7971e41" as const,
} as const;

/** keccak256(abi.encodePacked(IERC20(usdm).symbol(), IERC20(g$).symbol())) */
export const G_DOLLAR_USDM_EXCHANGE_ID =
  "0xba77f5c7bb3317643c6d81d1ef3f9913561741d92095f88efa402faf2cbe9124" as const;

export const UNISWAP_V3_QUOTER_ADDRESS = {
  [CELO_CHAIN_ID]: "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8" as const,
} as const;

export const UNISWAP_V3_SWAP_ROUTER_ADDRESS = {
  [CELO_CHAIN_ID]: "0x5615CDAb10dc425a742d643d949a7F474C01abc4" as const,
} as const;

/** Best observed fee tier for USDm/USDT on Celo Uniswap V3. */
export const UNISWAP_USDM_USDT_FEE = 100;

export const G_DOLLAR_CELO = G_DOLLAR_ADDRESS[CELO_CHAIN_ID];
export const USDT_CELO = CELO_USDT_ADDRESS[CELO_CHAIN_ID];
export const USDM_CELO = CELO_USDM_ADDRESS[CELO_CHAIN_ID];
export const MENTO_BROKER_CELO = MENTO_BROKER_ADDRESS[CELO_CHAIN_ID];
export const MENTO_EXCHANGE_PROVIDER_CELO =
  MENTO_EXCHANGE_PROVIDER_ADDRESS[CELO_CHAIN_ID];
export const UNISWAP_QUOTER_CELO = UNISWAP_V3_QUOTER_ADDRESS[CELO_CHAIN_ID];
export const UNISWAP_ROUTER_CELO = UNISWAP_V3_SWAP_ROUTER_ADDRESS[CELO_CHAIN_ID];
