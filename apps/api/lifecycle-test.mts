/**
 * Full-lifecycle live test: the test agent 0xe164… now has a REAL 250 G$ bond
 * staked on Celo mainnet by the throwaway deployer. This script signs a real
 * credential for it and submits it to the production API.
 *
 * Expected: rejected with `operator_not_verified` — the bond alone is not
 * enough, the operator must also be a GoodDollar-verified human.
 *
 * Run: PK=0x... npx tsx lifecycle-test.mts
 */
import { privateKeyToAccount } from "viem/accounts";
import { GOODAGENT_API_URL } from "@goodagent/shared";

const API = process.env.API_URL ?? GOODAGENT_API_URL;
const account = privateKeyToAccount(process.env.PK as `0x${string}`);
const agent = "0xe1643a041D98228ddEB388353889BFc13d9a84C1";

const domain = {
  name: "GoodDollar Agent ID",
  version: "1",
  chainId: 42220,
  verifyingContract: "0x0000000000000000000000000000000000000000",
} as const;

const types = {
  AgentID: [
    { name: "agent", type: "address" },
    { name: "operator", type: "address" },
    { name: "humanRoot", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

const now = BigInt(Math.floor(Date.now() / 1000));
const fields = {
  agent,
  operator: account.address,
  humanRoot: account.address,
  nonce: now,
  issuedAt: now,
  expiresAt: now + 15552000n, // +180 days
} as const;

const signature = await account.signTypedData({
  domain,
  types,
  primaryType: "AgentID",
  message: fields,
});

const res = await fetch(`${API}/agent/issue`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    fields: {
      agent,
      operator: fields.operator,
      humanRoot: fields.humanRoot,
      nonce: fields.nonce.toString(),
      issuedAt: fields.issuedAt.toString(),
      expiresAt: fields.expiresAt.toString(),
    },
    signature,
    chainId: 42220,
    verifyingContract: domain.verifyingContract,
  }),
});

console.log(
  "issue with REAL 250 G$ bond, unverified human:",
  res.status,
  JSON.stringify(await res.json()),
);
