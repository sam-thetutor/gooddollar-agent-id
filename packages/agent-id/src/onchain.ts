/**
 * On-chain actions: everything an agent (or operator) needs to interact with
 * the GoodDollar Agent ID contracts using only this SDK and viem.
 *
 * - Attestation (agent key proof-of-possession, REQUIRED before registration):
 *   {@link isAgentAttested}, {@link signAgentAttestation},
 *   {@link attestAsAgent}, {@link relayAgentAttestation}
 * - Revocation (operator kill switch):
 *   {@link revokeAgentOnChain}, {@link reinstateAgentOnChain}
 * - Full ABIs for direct viem use: {@link agentAttestationAbi},
 *   {@link agentRevocationAbi}, {@link agentVaultAbi}
 */
import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type Hex,
  type LocalAccount,
  type WalletClient,
} from "viem";
import { celo } from "viem/chains";
import {
  AGENT_ATTESTATION_CELO,
  AGENT_REVOCATION_CELO,
  attestationTypedData,
  getAttestationNonce,
  type AttestationLookupOptions,
} from "./chain-lookup.js";

// ---------------------------------------------------------------------------
// ABIs (full, write-capable — the lookups in chain-lookup.ts use read subsets)
// ---------------------------------------------------------------------------

/** AgentAttestation registry — agent key proof-of-possession. */
export const agentAttestationAbi = [
  {
    type: "function",
    name: "attest",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "attestFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isProven",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
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
  {
    type: "event",
    name: "AgentAttested",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "at", type: "uint256", indexed: false },
      { name: "relayer", type: "address", indexed: false },
    ],
  },
] as const;

/** AgentRevocation registry — operator-controlled kill switch. */
export const agentRevocationAbi = [
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "reinstate",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "isRevoked",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "revokedAt",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "AgentRevoked",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "at", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentReinstated",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "operator", type: "address", indexed: true },
    ],
  },
] as const;

/** AgentVault — the required refundable G$ bond (read + operator actions). */
export const agentVaultAbi = [
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "requestUnstake",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawStake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unstakeUnlockAt",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "unlockAt", type: "uint256" }],
  },
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
  {
    type: "function",
    name: "operatorOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "operator", type: "address" },
      { name: "stakeAmount", type: "uint256" },
      { name: "unlockAt", type: "uint256" },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Attestation actions
// ---------------------------------------------------------------------------

/** Has the agent proven key ownership on-chain? (Registration requires it.) */
export async function isAgentAttested(
  agent: Address,
  opts?: AttestationLookupOptions,
): Promise<boolean> {
  const client = createPublicClient({
    chain: celo,
    transport: http(opts?.rpcUrl ?? "https://forno.celo.org"),
  });
  return client.readContract({
    address: opts?.attestation ?? (AGENT_ATTESTATION_CELO as Address),
    abi: agentAttestationAbi,
    functionName: "isProven",
    args: [getAddress(agent)],
  });
}

/** A signed, relay-ready attestation (single-use, deadline-bound). */
export interface SignedAttestation {
  agent: Address;
  deadline: bigint;
  signature: Hex;
}

/**
 * Sign an `AttestAgent` message with the agent's own key. The result can be
 * relayed by ANYONE via {@link relayAgentAttestation} (or `attestFor` directly)
 * — the relayer only pays gas; the signature is the proof. Use this when the
 * agent holds no CELO. Fetches the agent's current on-chain nonce, so the
 * signature is single-use.
 */
export async function signAgentAttestation(
  account: LocalAccount,
  opts?: AttestationLookupOptions & {
    /** Validity window in seconds. Defaults to 1 hour. */
    ttlSeconds?: number;
    /** Skip the RPC nonce read (e.g. offline signing or tests). */
    nonce?: bigint;
  },
): Promise<SignedAttestation> {
  const agent = account.address;
  const nonce = opts?.nonce ?? (await getAttestationNonce(agent, opts));
  const deadline = BigInt(
    Math.floor(Date.now() / 1000) + (opts?.ttlSeconds ?? 3600),
  );
  const signature = await account.signTypedData(
    attestationTypedData({
      agent,
      nonce,
      deadline,
      attestation: opts?.attestation,
    }),
  );
  return { agent, deadline, signature };
}

/**
 * Attest directly from the agent's own account (`attest()`; msg.sender is the
 * proof). Requires the wallet to hold a little CELO for gas.
 * Returns the transaction hash.
 */
export async function attestAsAgent(
  wallet: WalletClient,
  opts?: { attestation?: Address },
): Promise<Hex> {
  return wallet.writeContract({
    address: opts?.attestation ?? (AGENT_ATTESTATION_CELO as Address),
    abi: agentAttestationAbi,
    functionName: "attest",
    chain: celo,
    account: wallet.account!,
  });
}

/**
 * Relay an agent's signed attestation on-chain (`attestFor`). Any funded
 * wallet can call this; only the agent's signature counts.
 * Returns the transaction hash.
 */
export async function relayAgentAttestation(
  wallet: WalletClient,
  signed: SignedAttestation,
  opts?: { attestation?: Address },
): Promise<Hex> {
  return wallet.writeContract({
    address: opts?.attestation ?? (AGENT_ATTESTATION_CELO as Address),
    abi: agentAttestationAbi,
    functionName: "attestFor",
    args: [getAddress(signed.agent), signed.deadline, signed.signature],
    chain: celo,
    account: wallet.account!,
  });
}

// ---------------------------------------------------------------------------
// Revocation actions (operator only — the contract enforces it)
// ---------------------------------------------------------------------------

/**
 * Flip the on-chain kill switch for an agent. Only the wallet that owns the
 * agent's AgentVault bond can do this; every live verifier then fails the
 * agent with `revoked`. Returns the transaction hash.
 */
export async function revokeAgentOnChain(
  wallet: WalletClient,
  agent: Address,
  opts?: { revocation?: Address },
): Promise<Hex> {
  return wallet.writeContract({
    address: opts?.revocation ?? (AGENT_REVOCATION_CELO as Address),
    abi: agentRevocationAbi,
    functionName: "revoke",
    args: [getAddress(agent)],
    chain: celo,
    account: wallet.account!,
  });
}

/** Undo {@link revokeAgentOnChain}. Operator only. Returns the tx hash. */
export async function reinstateAgentOnChain(
  wallet: WalletClient,
  agent: Address,
  opts?: { revocation?: Address },
): Promise<Hex> {
  return wallet.writeContract({
    address: opts?.revocation ?? (AGENT_REVOCATION_CELO as Address),
    abi: agentRevocationAbi,
    functionName: "reinstate",
    args: [getAddress(agent)],
    chain: celo,
    account: wallet.account!,
  });
}
