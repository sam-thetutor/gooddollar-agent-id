#!/usr/bin/env node
/**
 * Bulk-import GameArena (or any) wallets as GoodAgent deploys.
 *
 * Usage (on VPS, keys stay in a local file — never commit it):
 *   node scripts/import-wallet-agents.mjs --file /path/to/agents.local.json
 *   node scripts/import-wallet-agents.mjs --file agents.local.json --retry-failed
 *
 * Optional per-agent fields:
 *   deployId  — resume an existing failed deploy instead of creating a duplicate
 * [
 *   { "displayName": "Erjok17", "privateKey": "0x..." },
 *   ...
 * ]
 *
 * Env (auto-read from /home/geinz/gcopilot/.env on VPS):
 *   HOST_BASE          default http://127.0.0.1:3010
 *   HOST_INTERNAL_SECRET
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_GAMEARENA_CONFIG = {
  PLAY_MODE: "offchain",
  MARKOV_STRATEGY: "random",
  RPS_SEQUENCE: "rock,paper,scissors",
  RPS_FIXED: "rock",
  DAILY_MATCH_CAP: "50",
  AUTO_REFILL: "1",
  DAILY_REFILL_CAP_GS: "20",
  MAX_REFILLS_PER_DAY: "10",
  WAGER_GS: "1",
  DAILY_LOSS_CAP_GS: "20",
  ACCEPT_TIMEOUT_SECONDS: "90",
  GAME_TYPE: "0",
  MAX_MATCHES: "10",
  MATCH_INTERVAL_SECONDS: "300",
};

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function parseArgs(argv) {
  let file = null;
  let retryFailed = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) file = argv[++i];
    if (argv[i] === "--retry-failed") retryFailed = true;
  }
  if (!file) {
    console.error(
      "Usage: node scripts/import-wallet-agents.mjs --file agents.local.json [--retry-failed]",
    );
    process.exit(1);
  }
  return { file: resolve(file), retryFailed };
}

async function importOne(hostBase, secret, agent) {
  const payload = {
    displayName: agent.displayName,
    importedPrivateKey: agent.privateKey,
    skillConfigurations: {
      "gaming/wagering/gamearena_1v1":
        agent.configuration ?? DEFAULT_GAMEARENA_CONFIG,
    },
  };
  if (agent.deployId) payload.deployId = agent.deployId;

  const res = await fetch(`${hostBase}/internal/import-wallet-deploy`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function findExistingDeploy(hostBase, ownerWallet) {
  const res = await fetch(
    `${hostBase}/deploy?ownerWallet=${encodeURIComponent(ownerWallet)}`,
  );
  if (!res.ok) return null;
  const body = await res.json();
  const agents = body.agents ?? [];
  const running = agents.find((a) => a.status === "running" && a.agentAddress);
  if (running) return { kind: "running", agent: running };
  const failed = agents.find((a) => a.status === "failed" && a.agentAddress);
  if (failed) return { kind: "failed", agent: failed };
  return null;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env"));
  loadEnvFile("/home/geinz/gcopilot/.env");

  const { file, retryFailed } = parseArgs(process.argv);
  const agents = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(agents) || !agents.length) {
    throw new Error("agents file must be a non-empty JSON array");
  }

  const hostBase = (process.env.HOST_BASE ?? "http://127.0.0.1:3010").replace(/\/$/, "");
  const secret = process.env.HOST_INTERNAL_SECRET?.trim();
  if (!secret) throw new Error("HOST_INTERNAL_SECRET is not set");

  console.log(`Importing ${agents.length} agent(s) via ${hostBase}\n`);

  const results = [];
  for (const agent of agents) {
    const label = agent.displayName ?? agent.name ?? "?";
    const privateKey = agent.privateKey ?? agent.pk;
    process.stdout.write(`→ ${label} … `);
    const started = Date.now();
    try {
      let deployId = agent.deployId;
      if (!deployId && privateKey) {
        const { privateKeyToAccount } = await import("viem/accounts");
        const owner = privateKeyToAccount(
          privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`,
        ).address;
        const existing = await findExistingDeploy(hostBase, owner);
        if (existing?.kind === "running") {
          console.log(`SKIP already running deploy=${existing.agent.id}`);
          results.push({
            displayName: label,
            ok: true,
            skipped: true,
            deployId: existing.agent.id,
            agentAddress: existing.agent.agentAddress,
            status: "running",
          });
          continue;
        }
        if (retryFailed && existing?.kind === "failed") {
          deployId = existing.agent.id;
        }
      }

      const { status, body } = await importOne(hostBase, secret, {
        displayName: agent.displayName ?? agent.name,
        privateKey,
        configuration: agent.configuration,
        deployId,
      });
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      if (status >= 400) {
        const err = body.message ?? body.error ?? JSON.stringify(body);
        console.log(`FAIL (${elapsed}s) ${err}`);
        results.push({ displayName: label, ok: false, error: err });
        continue;
      }
      console.log(
        `OK (${elapsed}s) deploy=${body.agent?.id} addr=${body.agent?.agentAddress} status=${body.agent?.status} verified=${body.verify?.valid}`,
      );
      results.push({
        displayName: label,
        ok: true,
        deployId: body.agent?.id,
        agentAddress: body.agent?.agentAddress,
        status: body.agent?.status,
        verified: body.verify?.valid,
        agentProven: body.verify?.agentProven,
      });
    } catch (err) {
      console.log(`ERR ${err instanceof Error ? err.message : err}`);
      results.push({ displayName: label, ok: false, error: String(err) });
    }
  }

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
