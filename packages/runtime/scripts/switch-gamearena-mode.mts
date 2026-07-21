#!/usr/bin/env node
/** Switch a GameArena deploy play mode (owner-signed). */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import { buildDeployControlMessage } from "@goodagent/shared";

loadEnv({ path: resolve(process.cwd(), "../../.env") });

const DEPLOY_ID = process.argv[2] ?? "cmrsdzu5f0000kqqgny5plfwy";
const PLAY_MODE = process.argv[3] ?? "offchain";
const HOST_BASE = (
  process.env.HOST_BASE ?? "https://goodagentids.xyz/host"
).replace(/\/$/, "");

const OFFCHAIN_PATCH = {
  PLAY_MODE: "offchain",
  AUTO_REFILL: "1",
  DAILY_REFILL_CAP_GS: "20",
  MAX_REFILLS_PER_DAY: "10",
  DAILY_MATCH_CAP: "50",
  MAX_MATCHES: "10",
  MATCH_INTERVAL_SECONDS: "300",
};

async function main() {
  const pk = process.env.OPERATOR_PRIVATE_KEY?.trim() as `0x${string}` | undefined;
  if (!pk) throw new Error("OPERATOR_PRIVATE_KEY missing");

  const owner = privateKeyToAccount(pk);
  const issuedAt = Date.now();
  const message = buildDeployControlMessage("configuration", DEPLOY_ID, issuedAt);
  const signature = await owner.signMessage({ message });

  const configuration =
    PLAY_MODE === "offchain" || PLAY_MODE === "auto"
      ? { ...OFFCHAIN_PATCH, PLAY_MODE }
      : { PLAY_MODE };

  const res = await fetch(`${HOST_BASE}/deploy/${DEPLOY_ID}/configuration`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      configuration,
      ownerWallet: owner.address,
      signature,
      issuedAt,
    }),
  });
  const body = await res.json();
  console.log(res.status, JSON.stringify(body, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
