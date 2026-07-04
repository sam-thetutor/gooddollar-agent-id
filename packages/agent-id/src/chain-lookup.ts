import {
  createPublicClient,
  getAddress,
  http,
  isAddressEqual,
  zeroAddress,
  type Address,
} from "viem";
import { celo } from "viem/chains";
import type {
  HumanRootLookup,
  RevocationLookup,
  StakeLookup,
  VerifyOptions,
} from "./verify.js";
import { verifyAgentId } from "./verify.js";
import type { AgentIdCredential, VerifyResult } from "./types.js";

/** GoodDollar Identity (sybil resistance) on Celo mainnet. */
export const GOODDOLLAR_IDENTITY_CELO =
  "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42" as const;

/** AgentVault (required refundable G$ bond) on Celo mainnet. */
export const AGENT_VAULT_CELO =
  "0x0409042B55e99Df8c0Feb7525A770838f3A47090" as const;

/** AgentRevocation (on-chain operator kill switch) on Celo mainnet. */
export const AGENT_REVOCATION_CELO =
  "0xA86a133626989115a6499b6cA67c3c8dA1662137" as const;

/** AgentAttestation (agent key proof-of-possession registry) on Celo mainnet. */
export const AGENT_ATTESTATION_CELO =
  "0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2" as const;

const identityAbi = [
  {
    type: "function",
    name: "getWhitelistedRoot",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "whitelisted", type: "address" }],
  },
] as const;

export interface HumanRootLookupOptions {
  /** Celo RPC URL. Defaults to the public forno endpoint. */
  rpcUrl?: string;
  /** Override the GoodDollar Identity contract address. */
  identity?: Address;
}

/**
 * Build a {@link HumanRootLookup} backed by the live GoodDollar Identity contract
 * on Celo. Returns the operator's whitelisted root, or null if not verified.
 * Self-contained (viem only) so the SDK has no workspace dependencies.
 */
export function createHumanRootLookup(
  opts?: HumanRootLookupOptions,
): HumanRootLookup {
  const client = createPublicClient({
    chain: celo,
    transport: http(opts?.rpcUrl ?? "https://forno.celo.org"),
  });
  const identity = opts?.identity ?? (GOODDOLLAR_IDENTITY_CELO as Address);

  return async (operator: Address): Promise<Address | null> => {
    const root = await client.readContract({
      address: identity,
      abi: identityAbi,
      functionName: "getWhitelistedRoot",
      args: [getAddress(operator)],
    });
    if (!root || isAddressEqual(root as Address, zeroAddress)) return null;
    return root as Address;
  };
}

/** Default live lookup against GoodDollar Identity on Celo mainnet. */
export const liveHumanRootLookup: HumanRootLookup = createHumanRootLookup();

const agentVaultAbi = [
  {
    type: "function",
    name: "stakeOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface StakeLookupOptions {
  /** Celo RPC URL. Defaults to the public forno endpoint. */
  rpcUrl?: string;
  /** Override the AgentVault contract address. */
  vault?: Address;
}

/**
 * Build a {@link StakeLookup} backed by the live AgentVault on Celo. Reads the
 * agent's current G$ bond and the vault minimum, so verification fails with
 * `insufficient_bond` once an operator withdraws the bond.
 */
export function createStakeLookup(opts?: StakeLookupOptions): StakeLookup {
  const client = createPublicClient({
    chain: celo,
    transport: http(opts?.rpcUrl ?? "https://forno.celo.org"),
  });
  const vault = opts?.vault ?? (AGENT_VAULT_CELO as Address);

  return async (agent: Address) => {
    const [stake, minStake] = await Promise.all([
      client.readContract({
        address: vault,
        abi: agentVaultAbi,
        functionName: "stakeOf",
        args: [getAddress(agent)],
      }),
      client.readContract({
        address: vault,
        abi: agentVaultAbi,
        functionName: "minStake",
      }),
    ]);
    return { stake, minStake };
  };
}

/** Default live bond lookup against the AgentVault on Celo mainnet. */
export const liveStakeLookup: StakeLookup = createStakeLookup();

const agentRevocationAbi = [
  {
    type: "function",
    name: "isRevoked",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface RevocationLookupOptions {
  /** Celo RPC URL. Defaults to the public forno endpoint. */
  rpcUrl?: string;
  /** Override the AgentRevocation contract address. */
  revocation?: Address;
}

/**
 * Build a {@link RevocationLookup} backed by the live AgentRevocation registry
 * on Celo. Verification fails with `revoked` once the agent's operator flags it
 * on-chain — so revocation is honored by every SDK verifier, not just the API.
 */
export function createRevocationLookup(
  opts?: RevocationLookupOptions,
): RevocationLookup {
  const client = createPublicClient({
    chain: celo,
    transport: http(opts?.rpcUrl ?? "https://forno.celo.org"),
  });
  const revocation = opts?.revocation ?? (AGENT_REVOCATION_CELO as Address);

  return async (agent: Address) =>
    client.readContract({
      address: revocation,
      abi: agentRevocationAbi,
      functionName: "isRevoked",
      args: [getAddress(agent)],
    });
}

/** Default live revocation lookup against AgentRevocation on Celo mainnet. */
export const liveRevocationLookup: RevocationLookup = createRevocationLookup();

const agentAttestationAbi = [
  {
    type: "function",
    name: "provenAt",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Resolves when (unix seconds) the agent proved on-chain that it controls its
 * key — 0n means it never has. See {@link createAttestationLookup}.
 */
export type AttestationLookup = (agent: Address) => Promise<bigint> | bigint;

export interface AttestationLookupOptions {
  /** Celo RPC URL. Defaults to the public forno endpoint. */
  rpcUrl?: string;
  /** Override the AgentAttestation contract address. */
  attestation?: Address;
}

/**
 * Build an {@link AttestationLookup} backed by the AgentAttestation registry
 * on Celo. An agent attests once — either by calling `attest()` from its own
 * account, or by signing an `AttestAgent` EIP-712 message that anyone relays
 * via `attestFor` — and the fact becomes publicly verifiable without trusting
 * the issuing API. NOTE: this is a *historical* fact ("the key existed and
 * consented"); live counterparty authentication still needs a fresh AgentAuth.
 */
export function createAttestationLookup(
  opts?: AttestationLookupOptions,
): AttestationLookup {
  const client = createPublicClient({
    chain: celo,
    transport: http(opts?.rpcUrl ?? "https://forno.celo.org"),
  });
  const attestation = opts?.attestation ?? (AGENT_ATTESTATION_CELO as Address);

  return async (agent: Address) =>
    client.readContract({
      address: attestation,
      abi: agentAttestationAbi,
      functionName: "provenAt",
      args: [getAddress(agent)],
    });
}

/** Default live attestation lookup against AgentAttestation on Celo mainnet. */
export const liveAttestationLookup: AttestationLookup = createAttestationLookup();

/** Read the agent's current `attestFor` nonce (needed to sign a relayed attestation). */
export async function getAttestationNonce(
  agent: Address,
  opts?: AttestationLookupOptions,
): Promise<bigint> {
  const client = createPublicClient({
    chain: celo,
    transport: http(opts?.rpcUrl ?? "https://forno.celo.org"),
  });
  return client.readContract({
    address: opts?.attestation ?? (AGENT_ATTESTATION_CELO as Address),
    abi: agentAttestationAbi,
    functionName: "nonces",
    args: [getAddress(agent)],
  });
}

/**
 * EIP-712 typed data for the AgentAttestation registry's `attestFor` flow.
 * The agent signs this once; anyone can then submit the signature on-chain
 * (the relayer pays gas, only the agent's signature counts). Single-use:
 * bound to the agent's current on-chain nonce and a deadline.
 */
export function attestationTypedData(input: {
  agent: Address;
  nonce: bigint;
  /** Unix seconds after which the signature is unusable. */
  deadline: bigint;
  attestation?: Address;
  chainId?: number;
}) {
  return {
    domain: {
      name: "GoodDollar Agent Attestation",
      version: "1",
      chainId: input.chainId ?? celo.id,
      verifyingContract:
        input.attestation ?? (AGENT_ATTESTATION_CELO as Address),
    },
    types: {
      AttestAgent: [
        { name: "agent", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "AttestAgent",
    message: {
      agent: input.agent,
      nonce: input.nonce,
      deadline: input.deadline,
    },
  } as const;
}

/**
 * Verify a credential with **all live checks on by default** against Celo
 * mainnet: live human root, on-chain revocation, and the live G$ bond. This is
 * the recommended entry point for verifiers — a bare {@link verifyAgentId} call
 * with only a human-root lookup silently skips the bond and revocation checks
 * (visible as `bondChecked: false` / `revocationChecked: false`).
 *
 * Pass `stakeLookup: false` or `revocationLookup: false` to opt a specific
 * live check out; pass a custom lookup to override the endpoint.
 */
export async function verifyAgentIdLive(
  credential: AgentIdCredential,
  opts?: Partial<Omit<VerifyOptions, "stakeLookup" | "revocationLookup">> & {
    stakeLookup?: StakeLookup | false;
    revocationLookup?: RevocationLookup | false;
    attestationLookup?: AttestationLookup | false;
    rpcUrl?: string;
  },
): Promise<VerifyResult> {
  const humanRootLookup =
    opts?.humanRootLookup ??
    (opts?.rpcUrl ? createHumanRootLookup({ rpcUrl: opts.rpcUrl }) : liveHumanRootLookup);
  const stakeLookup =
    opts?.stakeLookup === false
      ? undefined
      : (opts?.stakeLookup ??
        (opts?.rpcUrl ? createStakeLookup({ rpcUrl: opts.rpcUrl }) : liveStakeLookup));
  const revocationLookup =
    opts?.revocationLookup === false
      ? undefined
      : (opts?.revocationLookup ??
        (opts?.rpcUrl
          ? createRevocationLookup({ rpcUrl: opts.rpcUrl })
          : liveRevocationLookup));
  const attestationLookup =
    opts?.attestationLookup === false
      ? undefined
      : (opts?.attestationLookup ??
        (opts?.rpcUrl
          ? createAttestationLookup({ rpcUrl: opts.rpcUrl })
          : liveAttestationLookup));

  // Attestation is informational (doesn't gate validity), so read it in
  // parallel and tolerate RPC failures by simply leaving the fields unset.
  const attestationPromise = attestationLookup
    ? Promise.resolve(attestationLookup(credential.fields.agent)).catch(
        () => undefined,
      )
    : Promise.resolve(undefined);

  const result = await verifyAgentId(credential, {
    now: opts?.now,
    humanRootLookup,
    stakeLookup,
    revocationLookup,
  });

  const provenAt = await attestationPromise;
  if (provenAt !== undefined) {
    result.agentProven = provenAt !== 0n;
    if (provenAt !== 0n) result.agentProvenAt = provenAt;
  }
  return result;
}
