import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(pkgRoot, "../../..");

/** Load `.env` from monorepo root (local dev) or cwd (VPS). */
export function loadRuntimeEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(monorepoRoot, ".env"),
    resolve(process.env.AGENTS_ROOT ?? "", ".env"),
  ].filter((p) => p && existsSync(p));

  for (const path of candidates) {
    loadEnv({ path, override: false });
  }
}

export function getMonorepoRoot(): string {
  return monorepoRoot;
}

export interface RuntimeConfig {
  agentsRoot: string;
  deployMnemonic: string;
  relayerPrivateKey: `0x${string}`;
  operatorPrivateKey: `0x${string}` | null;
  apiBase: string;
  rpcUrl: string;
  databaseUrl: string | null;
  encryptionSecret: string | null;
}

export function getRuntimeConfig(): RuntimeConfig {
  const agentsRoot =
    process.env.AGENTS_ROOT ??
    resolve(monorepoRoot, ".goodagent/agents");

  const deployMnemonic = process.env.DEPLOY_MNEMONIC?.trim();
  if (!deployMnemonic) {
    throw new Error(
      "DEPLOY_MNEMONIC is required — generate a fresh 12/24-word mnemonic for the deploy pool only.",
    );
  }

  const relayerPk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!relayerPk) {
    throw new Error("PRIVATE_KEY is required (relayer wallet with CELO for attestFor gas).");
  }

  const operatorPk = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;

  return {
    agentsRoot,
    deployMnemonic,
    relayerPrivateKey: relayerPk,
    operatorPrivateKey: operatorPk ?? null,
    apiBase: process.env.API_BASE ?? "https://gcopilot-api.geinz.lol",
    rpcUrl: process.env.CELO_RPC_URL ?? "https://forno.celo.org",
    databaseUrl: process.env.DATABASE_URL ?? null,
    encryptionSecret: process.env.ENCRYPTION_SECRET ?? null,
  };
}
