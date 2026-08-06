#!/usr/bin/env node
/**
 * Smoke-test Action Order partner API routes (registry + agent lookup).
 *
 * Env:
 *   HOST_BASE                    default https://goodagentids.xyz/host
 *   ACTIONORDER_PARTNER_API_KEY  required when set on host
 *   TEST_AGENT_ADDRESS           optional play wallet for is-agent lookup
 *
 * Usage:
 *   pnpm --filter @goodagent/runtime test:partner-actionorder
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { GOODAGENT_HOST_URL } from "@goodagent/shared";

loadEnv({ path: resolve(process.cwd(), "../../.env") });

const HOST_BASE = (process.env.HOST_BASE ?? GOODAGENT_HOST_URL).replace(/\/$/, "");
const PARTNER_BASE = `${HOST_BASE}/partners/action-order`;
const PARTNER_KEY = process.env.ACTIONORDER_PARTNER_API_KEY?.trim() ?? "";
const TEST_AGENT =
  process.env.TEST_AGENT_ADDRESS?.trim() ??
  "0x85C53da868750F657D0280Be92b7350dB1292b09";

type Json = Record<string, unknown>;

async function partnerFetch(
  path: string,
  init?: RequestInit & { expectStatus?: number },
): Promise<{ status: number; body: Json }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(PARTNER_KEY ? { "x-partner-key": PARTNER_KEY } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
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

async function main() {
  console.log(`\n=== Action Order partner API test ===`);
  console.log(`host:        ${PARTNER_BASE}`);
  console.log(`partner key: ${PARTNER_KEY ? "set" : "not set"}\n`);

  const health = await fetch(`${HOST_BASE}/health`);
  if (!health.ok) throw new Error(`host health failed: ${health.status}`);
  ok("GET /health");

  const registry = await partnerFetch("/agent-addresses?page=1&pageSize=5", {
    expectStatus: 200,
  });
  ok(
    "GET /agent-addresses",
    `total=${registry.body.total} pageSize=${registry.body.pageSize}`,
  );

  const verified = await partnerFetch(
    "/agent-addresses?page=1&pageSize=5&verified=1",
    { expectStatus: 200 },
  );
  ok(
    "GET /agent-addresses?verified=1",
    `total=${verified.body.total}`,
  );

  const lookup = await partnerFetch(
    `/is-agent?address=${encodeURIComponent(TEST_AGENT)}`,
    { expectStatus: 200 },
  );
  ok(
    "GET /is-agent",
    lookup.body.isAgent
      ? `deploy=${lookup.body.deployId}`
      : "not an agent wallet",
  );

  if (lookup.body.isAgent && lookup.body.deployId) {
    const deployId = String(lookup.body.deployId);
    const byId = await partnerFetch(`/agents/${encodeURIComponent(deployId)}`, {
      expectStatus: 200,
    });
    ok(
      "GET /agents/:deployId",
      `ready=${byId.body.readyToPlay} verified=${byId.body.verified}`,
    );
  }

  console.log("\n=== summary ===");
  console.log("Registry routes OK — share /agent-addresses + /is-agent with Action Order.");
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
