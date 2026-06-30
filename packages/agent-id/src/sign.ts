import { hashTypedData, type Address, type Hex, type LocalAccount } from "viem";
import {
  AGENT_ID_PRIMARY_TYPE,
  agentIdDomain,
  agentIdTypes,
  type DomainOptions,
} from "./eip712.js";
import type { AgentIdCredential, AgentIdFields } from "./types.js";

/** 30 days, in seconds — default credential lifetime. */
export const DEFAULT_TTL_SECONDS = 30n * 24n * 60n * 60n;

export interface BuildAgentIdInput {
  agent: Address;
  operator: Address;
  humanRoot: Address;
  nonce?: bigint;
  /** Defaults to now (seconds). */
  issuedAt?: bigint;
  /** Explicit expiry (seconds). Overrides `ttlSeconds`. */
  expiresAt?: bigint;
  /** Lifetime from `issuedAt` when `expiresAt` is omitted. */
  ttlSeconds?: bigint;
}

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/** Fill defaults (issuedAt, expiry, zeros) and return canonical fields. */
export function buildAgentId(input: BuildAgentIdInput): AgentIdFields {
  const issuedAt = input.issuedAt ?? nowSeconds();
  const expiresAt =
    input.expiresAt ?? issuedAt + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS);

  return {
    agent: input.agent,
    operator: input.operator,
    humanRoot: input.humanRoot,
    nonce: input.nonce ?? 0n,
    issuedAt,
    expiresAt,
  };
}

/** EIP-712 digest for the given fields (what a wallet signs). */
export function hashAgentId(fields: AgentIdFields, opts?: DomainOptions): Hex {
  return hashTypedData({
    domain: agentIdDomain(opts),
    types: agentIdTypes,
    primaryType: AGENT_ID_PRIMARY_TYPE,
    message: fields,
  });
}

/**
 * Sign an Agent ID with a viem `LocalAccount` (server-side / tests). In the
 * browser, the web app signs via wagmi's `signTypedData` and assembles the
 * {@link AgentIdCredential} itself using the same domain/types.
 */
export async function signAgentId(
  account: LocalAccount,
  fields: AgentIdFields,
  opts?: DomainOptions,
): Promise<AgentIdCredential> {
  const domain = agentIdDomain(opts);
  const signature = await account.signTypedData({
    domain,
    types: agentIdTypes,
    primaryType: AGENT_ID_PRIMARY_TYPE,
    message: fields,
  });

  return {
    fields,
    signature,
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract,
  };
}
