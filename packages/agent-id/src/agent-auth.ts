import {
  isAddressEqual,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import {
  AGENT_AUTH_PRIMARY_TYPE,
  agentAuthTypes,
  agentIdDomain,
  type DomainOptions,
} from "./eip712.js";

/**
 * A challenge signed by the **agent's own key** proving it controls the agent
 * address *right now*. Presenting a (public) Agent ID credential proves a human
 * vouched for an address; it does NOT prove the presenter is that agent. Pair
 * the credential with a fresh {@link AgentAuth} to authenticate the counterparty.
 */
export interface AgentAuth {
  agent: Address;
  /** Verifier/service this proof is scoped to ("" = any). */
  audience: string;
  nonce: bigint;
  issuedAt: bigint;
}

/** JSON-safe wire form of {@link AgentAuth} plus its signature. */
export interface AgentAuthWire {
  agent: string;
  audience: string;
  nonce: string;
  issuedAt: string;
  signature: string;
}

/** Default freshness window for an agent auth: 5 minutes. */
export const DEFAULT_AGENT_AUTH_MAX_AGE_SECONDS = 300n;

export type AgentAuthFailureReason =
  | "agent_auth_bad_signature"
  | "agent_auth_wrong_agent"
  | "agent_auth_expired"
  | "agent_auth_future"
  | "agent_auth_audience_mismatch";

export interface AgentAuthResult {
  valid: boolean;
  reason?: AgentAuthFailureReason;
  agent?: Address;
}

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

export interface BuildAgentAuthInput {
  agent: Address;
  /** Verifier/service scope. Defaults to "" (any). */
  audience?: string;
  /** Defaults to now (seconds). */
  issuedAt?: bigint;
  /** Random-ish replay nonce. Defaults to `issuedAt`. */
  nonce?: bigint;
}

/** Build an unsigned {@link AgentAuth} challenge with sensible defaults. */
export function buildAgentAuth(input: BuildAgentAuthInput): AgentAuth {
  const issuedAt = input.issuedAt ?? nowSeconds();
  return {
    agent: input.agent,
    audience: input.audience ?? "",
    nonce: input.nonce ?? issuedAt,
    issuedAt,
  };
}

/**
 * Sign an {@link AgentAuth} with the agent's viem `LocalAccount` and return the
 * wire form ready to send in a request header/body. The account address MUST
 * equal `auth.agent`.
 */
export async function signAgentAuth(
  account: LocalAccount,
  auth: AgentAuth,
  opts?: DomainOptions,
): Promise<AgentAuthWire> {
  const signature = await account.signTypedData({
    domain: agentIdDomain(opts),
    types: agentAuthTypes,
    primaryType: AGENT_AUTH_PRIMARY_TYPE,
    message: auth,
  });
  return agentAuthToWire(auth, signature);
}

export function agentAuthToWire(auth: AgentAuth, signature: Hex): AgentAuthWire {
  return {
    agent: auth.agent,
    audience: auth.audience,
    nonce: auth.nonce.toString(),
    issuedAt: auth.issuedAt.toString(),
    signature,
  };
}

export interface VerifyAgentAuthOptions {
  /** The agent address the auth must recover to (the registered agent). */
  expectedAgent: Address;
  /** If set, the auth's `audience` must equal this exactly. */
  expectedAudience?: string;
  /** Max age of the auth in seconds. Defaults to 5 minutes. */
  maxAgeSeconds?: bigint;
  /** Current time (seconds). Defaults to now. */
  now?: bigint;
  /** Small allowance for clock skew (seconds). Defaults to 60. */
  clockSkewSeconds?: bigint;
  domain?: DomainOptions;
}

/**
 * Verify an agent-signed {@link AgentAuthWire}: the signature must recover to the
 * expected agent address, the audience must match (when required), and the
 * timestamp must be fresh. This is the anti-impersonation check — a copied
 * credential is useless without a matching live auth.
 */
export async function verifyAgentAuth(
  wire: AgentAuthWire,
  opts: VerifyAgentAuthOptions,
): Promise<AgentAuthResult> {
  const auth: AgentAuth = {
    agent: wire.agent as Address,
    audience: wire.audience,
    nonce: BigInt(wire.nonce),
    issuedAt: BigInt(wire.issuedAt),
  };

  if (
    opts.expectedAudience !== undefined &&
    auth.audience !== opts.expectedAudience
  ) {
    return { valid: false, reason: "agent_auth_audience_mismatch" };
  }

  const now = opts.now ?? nowSeconds();
  const skew = opts.clockSkewSeconds ?? 60n;
  const maxAge = opts.maxAgeSeconds ?? DEFAULT_AGENT_AUTH_MAX_AGE_SECONDS;
  if (auth.issuedAt > now + skew) {
    return { valid: false, reason: "agent_auth_future" };
  }
  if (now - auth.issuedAt > maxAge) {
    return { valid: false, reason: "agent_auth_expired" };
  }

  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      domain: agentIdDomain(opts.domain),
      types: agentAuthTypes,
      primaryType: AGENT_AUTH_PRIMARY_TYPE,
      message: auth,
      signature: wire.signature as Hex,
    });
  } catch {
    return { valid: false, reason: "agent_auth_bad_signature" };
  }

  if (!isAddressEqual(recovered, opts.expectedAgent)) {
    return { valid: false, reason: "agent_auth_wrong_agent" };
  }
  if (!isAddressEqual(recovered, auth.agent)) {
    return { valid: false, reason: "agent_auth_wrong_agent" };
  }

  return { valid: true, agent: recovered };
}
