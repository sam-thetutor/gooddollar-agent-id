import type { GoodDollarEnv } from "@goodagent/shared";
import { CELO_CHAIN_ID } from "@goodagent/shared";

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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * AgentVault on Celo mainnet (packages/contracts): required refundable G$ stake
 * (minStake = 250 G$) to register an agent. Deployed 2026-06-30.
 * Override at runtime with the AGENT_VAULT_ADDRESS env var.
 */
export const AGENT_VAULT_ADDRESS = {
  [CELO_CHAIN_ID]: "0x0409042B55e99Df8c0Feb7525A770838f3A47090" as const,
} as const;

/**
 * AgentAttestation registry on Celo mainnet (packages/contracts): agents prove
 * key possession once via attest()/attestFor(); provenAt() is read live.
 */
export const AGENT_ATTESTATION_ADDRESS = {
  [CELO_CHAIN_ID]: "0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2" as const,
} as const;

/**
 * GoodDollarHumanProofProvider on Celo mainnet (packages/contracts): a standard
 * ERC-8004 `IHumanProofProvider` backed by the GoodDollar on-chain identity
 * whitelist. Deployed 2026-06-30. Lets any `IERC8004ProofOfHuman` registry
 * accept passport-free, GoodDollar-rooted humans as a proof-of-human source.
 */
export const GOODDOLLAR_PROOF_PROVIDER_ADDRESS = {
  [CELO_CHAIN_ID]: "0x80c4de6872049cb20989156bca50134c781f48c9" as const,
} as const;

/** ERC-8004 Identity Registry (CREATE2 singleton) on Celo mainnet. */
export const ERC8004_IDENTITY_REGISTRY = {
  [CELO_CHAIN_ID]: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
} as const;

/** ERC-8004 Reputation Registry on Celo mainnet. */
export const ERC8004_REPUTATION_REGISTRY = {
  [CELO_CHAIN_ID]: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const,
} as const;

/** Metadata key under which we store the GoodDollar proof in the registry. */
export const GOODDOLLAR_PROOF_METADATA_KEY = "gooddollar-proof-of-human";

/**
 * AgentVault address: prefers AGENT_VAULT_ADDRESS env override, falls back to the
 * known mainnet deployment. Returns null only if explicitly zeroed.
 */
export function getAgentVaultAddress(): `0x${string}` | null {
  const value =
    process.env.AGENT_VAULT_ADDRESS ?? AGENT_VAULT_ADDRESS[CELO_CHAIN_ID];
  if (!value || value === ZERO_ADDRESS) return null;
  return value as `0x${string}`;
}

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
