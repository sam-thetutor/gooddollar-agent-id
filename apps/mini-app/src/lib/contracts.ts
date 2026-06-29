// Browser-safe contract constants for write operations. We intentionally do NOT
// import @g-copilot/chain here: that package reads process.env (node-only) for
// RPC/env config, which breaks in the browser bundle.

/** GoodDollar UBIScheme on Celo mainnet. */
export const UBI_SCHEME_ADDRESS =
  "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" as const;

/** UBIScheme.claim() — claims the caller's daily UBI entitlement. */
export const ubiClaimAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
