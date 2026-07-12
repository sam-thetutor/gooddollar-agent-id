#!/usr/bin/env node
/**
 * Revoke Agent ID registrations in the DB to free per-human cap slots.
 * Usage: dotenv -e .env -- pnpm exec tsx scripts/revoke-operator-agents.mts <agent> [...]
 */
import {
  listAgentCredentialsByOperator,
  revokeAgentCredential,
} from "../packages/db/src/index.js";

async function main() {
  const agents = process.argv.slice(2);
  if (!agents.length) {
    console.error("Usage: revoke-operator-agents.mts <agent-address> [...]");
    process.exit(1);
  }

  for (const agent of agents) {
    const rec = await revokeAgentCredential(agent);
    console.log(`revoked ${rec.agent} at ${rec.revokedAt?.toISOString()}`);
  }

  const operator = process.env.OPERATOR_LIST ?? "0x85A4b09fb0788f1C549a68dC2EdAe3F97aeb5Dd7";
  const rows = await listAgentCredentialsByOperator(operator);
  const active = rows.filter((r) => !r.revokedAt).length;
  console.log(`operator ${operator}: ${active} active / ${rows.length} total (max 10)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
