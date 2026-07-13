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
    loadEnv({ path, override: true });
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
  /** G$ sent to each new agent play wallet (default 200). */
  agentInitialGs: number;
  /** CELO sent to each new agent wallet for gas (default 1). */
  agentInitialCelo: string;
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
  const mnemonicWords = deployMnemonic.split(/\s+/).filter(Boolean);
  if (mnemonicWords.length < 12) {
    throw new Error(
      `DEPLOY_MNEMONIC must be 12 or 24 BIP39 words (got ${mnemonicWords.length}). ` +
        "Wrap the phrase in double quotes in .env — dotenv otherwise reads only the first word.",
    );
  }

  const relayerPk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!relayerPk) {
    throw new Error("PRIVATE_KEY is required (relayer wallet with CELO for attestFor gas).");
  }

  const operatorPk = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;

  const agentInitialGs = Number(process.env.AGENT_INITIAL_GS ?? "200");
  if (!Number.isFinite(agentInitialGs) || agentInitialGs < 0) {
    throw new Error("AGENT_INITIAL_GS must be a non-negative number");
  }

  const agentInitialCelo = process.env.AGENT_INITIAL_CELO?.trim() || "1";

  return {
    agentsRoot,
    deployMnemonic,
    relayerPrivateKey: relayerPk,
    operatorPrivateKey: operatorPk ?? null,
    agentInitialGs,
    agentInitialCelo,
    apiBase: process.env.API_BASE ?? "https://gcopilot-api.geinz.lol",
    rpcUrl: process.env.CELO_RPC_URL ?? "https://forno.celo.org",
    databaseUrl: process.env.DATABASE_URL ?? null,
    encryptionSecret: process.env.ENCRYPTION_SECRET ?? null,
  };
}
