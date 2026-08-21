/**
 * E2E for the CELO-cards agent lane (rewritten GoodAgent integration).
 *
 * Prereqs, all local:
 *  - Upstash shim on 127.0.0.1:8790 (/tmp/upstash-shim.mjs)
 *  - fff host on 127.0.0.1:3002 (with ACTIONORDER_PARTNER_API_KEY set)
 *  - CELO-cards `next start` on 127.0.0.1:3300 with:
 *      UPSTASH_REDIS_REST_URL=http://127.0.0.1:8790 UPSTASH_REDIS_REST_TOKEN=dev
 *      GOODAGENT_HOST_URL=http://127.0.0.1:3002
 *      GOODAGENT_PARTNER_API_KEY=<same as host>
 *
 * Creates a scratch deploy owned by a throwaway wallet (borrowing the real
 * verified ACTION-ORDER agent address so the partner snapshot reports
 * verified), then exercises:
 *  1. GET  /api/goodagent/deploys            (allowlisted list shim)
 *  2. GET  /api/goodagent/deploy/:id/status  (allowlisted status shim)
 *  3. POST /api/agent/play-once              (owner-signed, full match loop)
 *  4. nonce replay of the same signature     (must be rejected)
 *  5. record-match landed in the host DB
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { prisma } from "@goodagent/db";

loadEnv({ path: resolve(import.meta.dirname, "../../../.env") });

const GAME = process.env.GAME_URL ?? "http://127.0.0.1:3300";

const VERIFIED_AGENT_ADDRESS = "0x85C53da868750F657D0280Be92b7350dB1292b09";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

function buildMessage(
  action: string,
  deployId: string,
  issuedAt: number,
  nonce: string,
): string {
  return [
    "GoodAgent deploy control",
    `Action: ${action}`,
    `Deploy: ${deployId}`,
    `Issued: ${issuedAt}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

async function main() {
  const owner = privateKeyToAccount(generatePrivateKey());
  console.log(`[setup] scratch owner ${owner.address}`);

  const agent = await prisma.deployedAgent.create({
    data: {
      displayName: "CELO-cards agent lane E2E",
      template: "gaming",
      ownerWallet: owner.address.toLowerCase(),
      agentAddress: VERIFIED_AGENT_ADDRESS.toLowerCase(),
      status: "running",
      skills: {
        create: [
          {
            skillId: "gaming/card-fighter/actionorder_vshouse",
            registryPath: "skills/actionorder-player",
            status: "installed",
            configJson: JSON.stringify({
              CHARACTER_ID: "riven",
              STRATEGY: "anti_strike",
              DIFFICULTY: "1",
            }),
          },
        ],
      },
    },
  });
  console.log(`[setup] scratch deploy ${agent.id}`);

  try {
    // 1. deploy list shim
    const listRes = await fetch(
      `${GAME}/api/goodagent/deploys?ownerWallet=${owner.address}`,
    );
    const listBody = (await listRes.json()) as {
      agents?: Array<{ id: string }>;
    };
    check("deploys shim returns scratch deploy", listRes.status === 200 &&
      Boolean(listBody.agents?.some((a) => a.id === agent.id)), listBody);

    // 2. status shim
    const statusRes = await fetch(
      `${GAME}/api/goodagent/deploy/${agent.id}/status`,
    );
    const statusBody = (await statusRes.json()) as { id?: string };
    check(
      "status shim returns deploy",
      statusRes.status === 200 && statusBody.id === agent.id,
      statusBody,
    );

    // 3. play-once — full match through the live resolve route
    const issuedAt = Date.now();
    const nonce = crypto.randomUUID();
    const signature = await owner.signMessage({
      message: buildMessage("play", agent.id, issuedAt, nonce),
    });
    const auth = { ownerWallet: owner.address, signature, issuedAt, nonce };

    const playRes = await fetch(`${GAME}/api/agent/play-once`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deployId: agent.id, ...auth }),
    });
    const playBody = (await playRes.json()) as {
      ok?: boolean;
      matchId?: string;
      won?: boolean;
      playerRoundsWon?: number;
      opponentRoundsWon?: number;
      pointsEarned?: number;
      error?: string;
    };
    console.log("[play]", JSON.stringify(playBody));
    check("play-once completes a match", playRes.status === 200 && playBody.ok === true, playBody);
    check(
      "match reaches 3 round wins on one side",
      playBody.playerRoundsWon === 3 || playBody.opponentRoundsWon === 3,
      playBody,
    );
    // Live scoring at difficulty 1: win 150 (225 flawless), loss 10.
    const expectedPoints = playBody.won
      ? playBody.opponentRoundsWon === 0
        ? 225
        : 150
      : 10;
    check(
      `points come from live houseMatchPoints (${expectedPoints})`,
      playBody.pointsEarned === expectedPoints,
      playBody.pointsEarned,
    );

    // 4. replaying the same signature must fail on the burned nonce
    const replayRes = await fetch(`${GAME}/api/agent/play-once`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deployId: agent.id, ...auth }),
    });
    const replayBody = (await replayRes.json()) as { error?: string };
    check(
      "replayed signature rejected (NONCE_REUSED)",
      replayRes.status === 401 && replayBody.error === "NONCE_REUSED",
      replayBody,
    );

    // 5. record-match landed in host DB
    const matches = await prisma.deployMatch.findMany({
      where: { deployedAgentId: agent.id },
    });
    check(
      "record-match persisted on host",
      matches.length === 1 && matches[0].matchId === playBody.matchId,
      matches.map((m) => m.matchId),
    );
  } finally {
    await prisma.deployedAgent.delete({ where: { id: agent.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
