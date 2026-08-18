/**
 * Local end-to-end test for Telegram chat control:
 * scratch deploy row → owner-signed link-token → claim (simulated Telegram
 * user) → status/pause as operator → rejection for a stranger → cleanup.
 *
 * Requires the host running on localhost (HOST_PORT) with the same .env.
 * Usage: pnpm exec tsx scripts/test-telegram-control-local.mts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildDeployControlMessage } from "@goodagent/shared";
import { prisma } from "@goodagent/db";

loadEnv({ path: resolve(import.meta.dirname, "../../../.env") });

const HOST = `http://localhost:${process.env.HOST_PORT ?? "3002"}`;
const SECRET = process.env.HOST_INTERNAL_SECRET?.trim();
if (!SECRET) throw new Error("HOST_INTERNAL_SECRET missing from .env");

const OPERATOR_TG_ID = 5551234;
const STRANGER_TG_ID = 999;

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

async function main() {
  const owner = privateKeyToAccount(generatePrivateKey());
  console.log(`[setup] scratch owner ${owner.address}`);

  const agent = await prisma.deployedAgent.create({
    data: {
      displayName: "TG Control Test (scratch)",
      template: "assistant",
      ownerWallet: owner.address.toLowerCase(),
      status: "running",
      brainConfig: JSON.stringify({
        enabled: true,
        botUsername: "scratch_test_bot",
      }),
    },
  });
  console.log(`[setup] scratch deploy ${agent.id}`);

  try {
    // 1. Owner-signed link token
    const issuedAt = Date.now();
    const signature = await owner.signMessage({
      message: buildDeployControlMessage("telegram-link", agent.id, issuedAt),
    });
    const tokenRes = await fetch(`${HOST}/deploy/${agent.id}/telegram/link-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerWallet: owner.address, signature, issuedAt }),
    });
    const tokenBody = (await tokenRes.json()) as {
      token?: string;
      deepLink?: string;
      botUsername?: string;
    };
    check("link-token issued (200)", tokenRes.status === 200, tokenBody);
    check(
      "deep link targets the bot",
      tokenBody.deepLink === `https://t.me/scratch_test_bot?start=link_${tokenBody.token}`,
      tokenBody.deepLink,
    );

    // 2. Brain claims the token on behalf of the Telegram user
    const claimRes = await fetch(
      `${HOST}/internal/deploy/${agent.id}/telegram/claim-link`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-host-secret": SECRET! },
        body: JSON.stringify({
          token: tokenBody.token,
          telegramUserId: OPERATOR_TG_ID,
          telegramUsername: "samthetutor",
        }),
      },
    );
    const claimBody = (await claimRes.json()) as { ok?: boolean; displayName?: string };
    check("claim-link succeeds", claimRes.status === 200 && claimBody.ok === true, claimBody);

    // 2b. Token is single-use
    const replayRes = await fetch(
      `${HOST}/internal/deploy/${agent.id}/telegram/claim-link`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-host-secret": SECRET! },
        body: JSON.stringify({ token: tokenBody.token, telegramUserId: STRANGER_TG_ID }),
      },
    );
    check("token replay rejected (410)", replayRes.status === 410);

    // 3. Operator id persisted
    const row = await prisma.deployedAgent.findUnique({ where: { id: agent.id } });
    const brain = JSON.parse(row?.brainConfig ?? "{}") as {
      operatorTelegramId?: number;
      operatorTelegramUsername?: string;
    };
    check("operatorTelegramId persisted", brain.operatorTelegramId === OPERATOR_TG_ID, brain);
    check(
      "operator username persisted",
      brain.operatorTelegramUsername === "samthetutor",
      brain,
    );

    // 4. Operator can query status
    const control = (action: string, telegramUserId: number) =>
      fetch(`${HOST}/internal/deploy/${agent.id}/control`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-host-secret": SECRET! },
        body: JSON.stringify({ action, telegramUserId }),
      });

    const statusRes = await control("status", OPERATOR_TG_ID);
    const statusBody = (await statusRes.json()) as { ok?: boolean; status?: string };
    check(
      "operator status ok",
      statusRes.status === 200 && statusBody.ok === true && statusBody.status === "running",
      statusBody,
    );

    // 5. Stranger is rejected
    const strangerRes = await control("status", STRANGER_TG_ID);
    check("stranger rejected (403 NOT_OPERATOR)", strangerRes.status === 403);

    // 6. Operator pauses (no pm2 process → stop is a no-op, DB flips to paused)
    const pauseRes = await control("pause", OPERATOR_TG_ID);
    const pauseBody = (await pauseRes.json()) as { ok?: boolean; status?: string };
    check(
      "pause flips status to paused",
      pauseRes.status === 200 && pauseBody.status === "paused",
      pauseBody,
    );
    const after = await prisma.deployedAgent.findUnique({ where: { id: agent.id } });
    check("DB status is paused", after?.status === "paused", after?.status);

    // 7. Resume on a never-provisioned scratch row fails cleanly
    const resumeRes = await control("resume", OPERATOR_TG_ID);
    check("resume on unprovisioned row → START_FAILED (500)", resumeRes.status === 500);
  } finally {
    await prisma.deployedAgent.delete({ where: { id: agent.id } });
    console.log(`[cleanup] deleted scratch deploy ${agent.id}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
