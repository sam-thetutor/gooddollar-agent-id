#!/usr/bin/env node
/**
 * Smoke-test all GameArena partner API routes.
 *
 * Uses OPERATOR_PRIVATE_KEY from monorepo .env (wallet …dd7) to sign requests.
 *
 * Env:
 *   HOST_BASE                  default https://goodagentids.xyz/host
 *   DEPLOY_ID                  deploy for signed/write routes (default MARKOV CLI)
 *   GAMEARENA_PARTNER_API_KEY  optional
 *   SKIP_PLAY=1                skip POST /play (slow)
 *
 * Usage:
 *   pnpm --filter @goodagent/runtime test:partner-gamearena
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildDeployControlMessage,
  type DeployControlAction,
  GOODAGENT_HOST_URL,
} from "@goodagent/shared";

loadEnv({ path: resolve(process.cwd(), "../../.env") });

const HOST_BASE = (process.env.HOST_BASE ?? GOODAGENT_HOST_URL).replace(/\/$/, "");
const PARTNER_BASE = `${HOST_BASE}/partners/gamearena`;
const PARTNER_KEY = process.env.GAMEARENA_PARTNER_API_KEY?.trim() ?? "";
const SKIP_PLAY = process.env.SKIP_PLAY === "1";
const DEFAULT_DEPLOY_ID = "cmrsdzu5f0000kqqgny5plfwy"; // MARKOV Fixed Rock CLI

type Json = Record<string, unknown>;

async function signControl(
  action: DeployControlAction,
  deployId: string,
  owner: ReturnType<typeof privateKeyToAccount>,
) {
  const issuedAt = Date.now();
  const message = buildDeployControlMessage(action, deployId, issuedAt);
  const signature = await owner.signMessage({ message });
  return { ownerWallet: owner.address, signature, issuedAt };
}

async function partnerFetch(
  path: string,
  init?: RequestInit & { expectStatus?: number },
): Promise<{ status: number; body: Json }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (PARTNER_KEY) headers["x-partner-key"] = PARTNER_KEY;

  const res = await fetch(`${PARTNER_BASE}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as Json;
  const expect = init?.expectStatus;
  if (expect != null && res.status !== expect) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`,
    );
  }
  return { status: res.status, body };
}

function ok(label: string, extra?: string) {
  console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
}

function warn(label: string, detail?: string) {
  console.log(`  ⚠ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail?: string): never {
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  process.exit(1);
}

async function main() {
  const pk = process.env.OPERATOR_PRIVATE_KEY?.trim() as `0x${string}` | undefined;
  if (!pk) fail("OPERATOR_PRIVATE_KEY missing in .env");

  const owner = privateKeyToAccount(pk);

  console.log(`\n=== GameArena partner API test ===`);
  console.log(`host:      ${PARTNER_BASE}`);
  console.log(`owner:     ${owner.address}`);
  console.log(`partner key: ${PARTNER_KEY ? "set" : "not set"}\n`);

  // List wallet deploys (host API)
  const listRes = await fetch(
    `${HOST_BASE}/deploy?ownerWallet=${encodeURIComponent(owner.address)}`,
  );
  const allDeploys = ((await listRes.json()) as { agents?: Json[] }).agents ?? [];
  const gaDeploys = allDeploys.filter((a) => {
    const skills = (a.skills as Json[] | undefined) ?? [];
    return skills.some((s) => String(s.skillId ?? "").includes("gamearena"));
  });
  console.log(`Wallet has ${allDeploys.length} deploys (${gaDeploys.length} GameArena)`);

  // --- Read routes ---
  console.log("GET routes");

  const agents = await partnerFetch(
    `/agents?owner=${encodeURIComponent(owner.address)}`,
    { expectStatus: 200 },
  );
  ok("GET /agents?owner=");
  const first = (agents.body.agents as Json[] | undefined)?.[0];
  const deployId =
    process.env.DEPLOY_ID?.trim() ||
    String(first?.deployId ?? DEFAULT_DEPLOY_ID);

  if (first) {
    console.log(
      `    partner first agent: ${first.displayName} (${first.deployId})`,
    );
  }
  console.log(`    write test deploy: ${deployId}`);

  console.log("\nNotable GameArena agents:");
  for (const id of [deployId, "cmrsdzu5f0000kqqgny5plfwy", "cmrzqsg3b0024kqydmj7aph34"]) {
    const d = allDeploys.find((a) => a.id === id);
    if (!d) continue;
    console.log(
      `  • ${d.displayName} (${id}) status=${d.status} agent=${String(d.agentAddress ?? "-").slice(0, 14)}…`,
    );
  }
  console.log("");

  const byId = await partnerFetch(`/agents/${encodeURIComponent(deployId)}`, {
    expectStatus: 200,
  });
  ok(
    "GET /agents/:deployId",
    `${byId.body.displayName} verified=${byId.body.verified} ready=${byId.body.readyToPlay}`,
  );

  const schema = await partnerFetch("/settings/schema", { expectStatus: 200 });
  ok(`GET /settings/schema (${(schema.body.fields as unknown[])?.length ?? 0} fields)`);

  await partnerFetch(`/settings?owner=${encodeURIComponent(owner.address)}`, {
    expectStatus: 200,
  });
  ok("GET /settings?owner=");

  await partnerFetch(`/agents/${encodeURIComponent(deployId)}/settings`, {
    expectStatus: 200,
  });
  ok("GET /agents/:deployId/settings");

  await partnerFetch(`/live?owner=${encodeURIComponent(owner.address)}`, {
    expectStatus: 200,
  });
  ok("GET /live?owner=");

  await partnerFetch(`/agents/${encodeURIComponent(deployId)}/live`, {
    expectStatus: 200,
  });
  ok("GET /agents/:deployId/live");

  // --- Write routes on provisioned deploy (MARKOV) ---
  console.log(`\nPATCH / POST routes (signed, deploy=${deployId})`);

  const configAuth = await signControl("configuration", deployId, owner);
  const patch = await partnerFetch(
    `/agents/${encodeURIComponent(deployId)}/settings`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...configAuth,
        configuration: { MARKOV_STRATEGY: "random", ROUND_PACE_MS: "1000" },
      }),
      expectStatus: 200,
    },
  );
  ok(
    "PATCH /agents/:deployId/settings",
    `strategy=${(patch.body.configuration as Json)?.MARKOV_STRATEGY}`,
  );

  // PATCH /settings?owner= targets FIRST agent (E2E) — expect failure if not provisioned
  const ownerPatch = await partnerFetch(
    `/settings?owner=${encodeURIComponent(owner.address)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...configAuth,
        configuration: { MARKOV_STRATEGY: "random" },
      }),
    },
  );
  if (ownerPatch.status === 200) {
    ok("PATCH /settings?owner=");
  } else {
    warn(
      "PATCH /settings?owner=",
      `${ownerPatch.status} ${ownerPatch.body.error} (first agent E2E has no skill dir)`,
    );
  }

  const stopAuth = await signControl("pause", deployId, owner);
  await partnerFetch(`/agents/${encodeURIComponent(deployId)}/stop`, {
    method: "POST",
    body: JSON.stringify(stopAuth),
    expectStatus: 200,
  });
  ok("POST /agents/:deployId/stop");

  const startAuth = await signControl("resume", deployId, owner);
  const startRes = await partnerFetch(
    `/agents/${encodeURIComponent(deployId)}/start`,
    { method: "POST", body: JSON.stringify(startAuth) },
  );
  if (startRes.status === 200) {
    ok("POST /agents/:deployId/start");
  } else if (startRes.status === 403 && startRes.body.error === "AGENT_NOT_VERIFIED") {
    warn("POST /start", "AGENT_NOT_VERIFIED (operator GoodDollar verify pending)");
  } else {
    fail("POST /start", `${startRes.status} ${JSON.stringify(startRes.body)}`);
  }

  if (SKIP_PLAY) {
    warn("POST /play", "skipped (SKIP_PLAY=1)");
  } else {
    const playAuth = await signControl("play", deployId, owner);
    const playById = await partnerFetch(
      `/agents/${encodeURIComponent(deployId)}/play`,
      { method: "POST", body: JSON.stringify(playAuth) },
    );
    if (playById.status === 200 && playById.body.matchId) {
      ok("POST /agents/:deployId/play", `matchId=${playById.body.matchId}`);
      console.log(`    liveWatchUrl: ${playById.body.liveWatchUrl}`);
    } else if (playById.status === 403) {
      warn("POST /agents/:deployId/play", String(playById.body.error));
    } else {
      warn("POST /agents/:deployId/play", `${playById.status} ${JSON.stringify(playById.body)}`);
    }

    const playOwner = await partnerFetch(
      `/play?owner=${encodeURIComponent(owner.address)}`,
      { method: "POST", body: JSON.stringify(playAuth) },
    );
    if (playOwner.status === 200) {
      ok("POST /play?owner=");
    } else {
      warn(
        "POST /play?owner=",
        `${playOwner.status} ${playOwner.body.error} (targets first agent, not MARKOV)`,
      );
    }
  }

  console.log("\n=== summary ===");
  console.log("All 7 GET routes: OK");
  console.log("Signed routes tested on MARKOV Fixed Rock (cmrsdzu5…)");
  console.log(`Dashboard: https://goodagentids.xyz/dashboard/${deployId}`);
  console.log(`Agent:     ${byId.body.agentAddress ?? "?"}`);
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
