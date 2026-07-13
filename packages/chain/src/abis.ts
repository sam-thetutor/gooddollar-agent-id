export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/** GoodDollar Identity (IdentityV2) — read methods used for verification status. */
export const identityAbi = [
  {
    type: "function",
    name: "isWhitelisted",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getWhitelistedRoot",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "whitelisted", type: "address" }],
  },
  {
    type: "function",
    name: "lastAuthenticated",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "authenticationPeriod",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "identities",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "dateAuthenticated", type: "uint256" },
      { name: "dateAdded", type: "uint256" },
      { name: "did", type: "string" },
      { name: "whitelistedOnChainId", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "isBlacklisted",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** AgentVault — required refundable G$ stake (bond) for Agent IDs (packages/contracts). */
export const agentVaultAbi = [
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
  {
    type: "function",
    name: "stakeOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * GoodDollarHumanProofProvider — ERC-8004 `IHumanProofProvider` backed by the
 * GoodDollar identity whitelist (packages/contracts).
 */
export const goodDollarProofProviderAbi = [
  {
    type: "function",
    name: "verifyHumanProof",
    stateMutability: "view",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "verified", type: "bool" },
      { name: "nullifier", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "providerName",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "verificationStrength",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "proofDigest",
    stateMutability: "view",
    inputs: [
      { name: "human", type: "address" },
      { name: "agent", type: "address" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

/** ERC-8004 Identity Registry (ERC-721 + URIStorage + metadata) — read methods. */
export const erc8004IdentityAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "getMetadata",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "metadataKey", type: "string" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/** GoodDollar UBIScheme — read methods for claim eligibility and stats. */
export const ubiSchemeAbi = [
  {
    type: "function",
    name: "checkEntitlement",
    stateMutability: "view",
    inputs: [{ name: "member", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "currentDay",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
