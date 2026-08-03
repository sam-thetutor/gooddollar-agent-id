#!/usr/bin/env node
/**
 * E2E: partner /start (ready) → /play → poll livePhase until match ends.
 *
 *   DEPLOY_ID=cmrsdzu5f0000kqqgny5plfwy pnpm exec tsx scripts/e2e-play-test.mts
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import { buildDeployControlMessage } from "@goodagent/shared";

loadEnv({ path: resolve(process.cwd(), "../../.env") });

const HOST = "https://goodagentids.xyz/host";
const PARTNER = `${HOST}/partners/gamearena`;
const DEPLOY_ID =
  process.env.DEPLOY_ID?.trim() ?? "cmrsdzu5f0000kqqgny5plfwy";
const PARTNER_KEY = process.env.GAMEARENA_PARTNER_API_KEY?.trim() ?? "";

type AgentSnap = {
  verified?: boolean;
  readyToPlay?: boolean;
  livePhase?: string | null;
  status?: string;
  activeMatchId?: string | null;
  matchesToday?: number | null;
};

async function main() {
  const pk = process.env.OPERATOR_PRIVATE_KEY?.trim() as `0x${string}` | undefined;
  if (!pk) throw new Error("OPERATOR_PRIVATE_KEY missing");

  const owner = privateKeyToAccount(pk);
  const t0 = Date.now();

  console.log("=== E2E play test (production) ===");
  console.log("deploy:", DEPLOY_ID);
  console.log("owner:", owner.address);
  console.log("partner key:", PARTNER_KEY ? "set" : "NOT SET");

  const before = await getAgent();
  console.log("before:", pick(before));

  if (!before.verified || !before.readyToPlay) {
    console.warn("WARN: agent not ready — play may fail with AGENT_NOT_VERIFIED");
  }

  const startAuth = await sign("resume", owner);
  const tStart = Date.now();
  const startRes = await partnerPost(`/agents/${DEPLOY_ID}/start`, startAuth);
  console.log(
    `\n/start ${startRes.status} (${Date.now() - tStart}ms):`,
    JSON.stringify(startRes.body),
  );

  const afterStart = await getAgent();
  console.log("after /start:", pick(afterStart));
  if (afterStart.livePhase === "starting" || afterStart.livePhase === "playing") {
    throw new Error("/start should not start a match — livePhase should be null");
  }

  const playAuth = await sign("play", owner);
  const tPlay = Date.now();
  const playRes = await partnerPost(`/agents/${DEPLOY_ID}/play`, playAuth);
  const playMs = Date.now() - tPlay;
  console.log(
    `\n/play ${playRes.status} (${playMs}ms):`,
    JSON.stringify(playRes.body),
  );

  if (playRes.status !== 200 || !playRes.body.matchId) {
    process.exit(1);
  }

  const matchId = String(playRes.body.matchId);
  console.log("liveWatchUrl:", playRes.body.liveWatchUrl);

  let sawPlaying = false;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const snap = await getAgent();
    const phase = snap.livePhase ?? "null";
    if (i < 8 || phase !== "null") {
      console.log(`poll ${i + 1}s: livePhase=${phase} match=${snap.activeMatchId ?? "-"}`);
    }
    if (phase === "playing") sawPlaying = true;
    if (sawPlaying && !snap.livePhase) {
      console.log("match ended — livePhase cleared");
      break;
    }
  }

  // Second /start then /play — regression for AGENT_BUSY
  const start2 = await partnerPost(`/agents/${DEPLOY_ID}/start`, startAuth);
  console.log(`\n/start again ${start2.status}: status=${start2.body.status}`);

  const play2Auth = await sign("play", owner);
  const tPlay2 = Date.now();
  const play2 = await partnerPost(`/agents/${DEPLOY_ID}/play`, play2Auth);
  console.log(
    `/play after /start ${play2.status} (${Date.now() - tPlay2}ms):`,
    play2.status === 200
      ? `matchId=${play2.body.matchId}`
      : JSON.stringify(play2.body),
  );

  console.log("\ntotal elapsed:", `${Math.round((Date.now() - t0) / 1000)}s`);
}

function pick(s: AgentSnap) {
  return {
    verified: s.verified,
    readyToPlay: s.readyToPlay,
    livePhase: s.livePhase ?? null,
    status: s.status,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (PARTNER_KEY) h["x-partner-key"] = PARTNER_KEY;
  return h;
}

async function getAgent(): Promise<AgentSnap> {
  const r = await fetch(`${PARTNER}/agents/${encodeURIComponent(DEPLOY_ID)}`);
  return (await r.json()) as AgentSnap;
}

async function sign(
  action: "play" | "resume" | "pause",
  owner: ReturnType<typeof privateKeyToAccount>,
) {
  const issuedAt = Date.now();
  const message = buildDeployControlMessage(action, DEPLOY_ID, issuedAt);
  const signature = await owner.signMessage({ message });
  return { ownerWallet: owner.address, signature, issuedAt };
}

async function partnerPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${PARTNER}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: json };
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
