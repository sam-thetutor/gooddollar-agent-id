import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { bytesToHex } from "viem";
import type { Address, Hex, LocalAccount } from "viem";
import type { RuntimeConfig } from "./config.js";

/** Sentinel derivation index for wallets imported from an external private key. */
export const IMPORTED_WALLET_DERIVATION_INDEX = -1;

const IMPORTED_KEY_FILE = ".imported-key";

const INDEX_FILE = ".wallet-index";

function indexPath(agentsRoot: string): string {
  return resolve(agentsRoot, INDEX_FILE);
}

/** Monotonic HD derivation index stored in `{agentsRoot}/.wallet-index`. */
export function allocateDerivationIndex(
  agentsRoot: string,
  minIndex = 0,
): number {
  mkdirSync(agentsRoot, { recursive: true });
  const path = indexPath(agentsRoot);
  let next = minIndex;
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8").trim();
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed)) next = Math.max(next, parsed);
  }
  writeFileSync(path, String(next + 1), "utf8");
  return next;
}

/** BIP44 path: m/44'/60'/0'/0/{index} */
export function deriveAgentAccount(
  mnemonic: string,
  index: number,
): LocalAccount {
  return mnemonicToAccount(mnemonic, { path: `m/44'/60'/0'/0/${index}` });
}

/** Hex private key for the agent HD wallet (for skills that sign on-chain). */
export function deriveAgentPrivateKey(
  mnemonic: string,
  index: number,
): `0x${string}` {
  const account = deriveAgentAccount(mnemonic, index) as LocalAccount & {
    getHdKey: () => { privateKey: Uint8Array };
  };
  const hd = account.getHdKey();
  if (!hd?.privateKey) {
    throw new Error("could not derive agent private key from mnemonic");
  }
  return bytesToHex(hd.privateKey) as `0x${string}`;
}

export function normalizeAgentPrivateKey(key: string): Hex {
  const trimmed = key.trim();
  const hex = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("imported private key must be 32-byte hex");
  }
  return hex as Hex;
}

export function isImportedWalletIndex(derivationIndex: number | null | undefined): boolean {
  return derivationIndex === IMPORTED_WALLET_DERIVATION_INDEX;
}

export function isAgentProvisioned(
  agentAddress: string | null | undefined,
  walletDerivationIndex: number | null | undefined,
): boolean {
  return Boolean(agentAddress && walletDerivationIndex != null);
}

function importedKeyPath(agentsRoot: string, deployId: string): string {
  return resolve(agentDir(agentsRoot, deployId), IMPORTED_KEY_FILE);
}

/** Persist an imported agent key on the host (skill .env also carries PRIVATE_KEY). */
export function writeImportedPrivateKey(
  agentsRoot: string,
  deployId: string,
  privateKey: Hex,
): string {
  const path = importedKeyPath(agentsRoot, deployId);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${privateKey}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort on platforms without chmod */
  }
  return path;
}

export function readImportedPrivateKey(
  agentsRoot: string,
  deployId: string,
): Hex {
  const path = importedKeyPath(agentsRoot, deployId);
  if (!existsSync(path)) {
    throw new Error(`imported wallet key missing for deploy ${deployId}`);
  }
  return normalizeAgentPrivateKey(readFileSync(path, "utf8"));
}

export function accountFromImportedPrivateKey(privateKey: string): LocalAccount {
  return privateKeyToAccount(normalizeAgentPrivateKey(privateKey));
}

/** Resolve the agent signing key from HD derivation or an imported wallet file. */
export function resolveAgentPrivateKey(
  config: RuntimeConfig,
  deployId: string,
  derivationIndex: number,
): Hex {
  if (isImportedWalletIndex(derivationIndex)) {
    return readImportedPrivateKey(config.agentsRoot, deployId);
  }
  return deriveAgentPrivateKey(config.deployMnemonic, derivationIndex);
}

export interface AgentWalletMeta {
  deployId: string;
  displayName: string;
  template: string;
  address: Address;
  derivationIndex: number;
  createdAt: string;
  /** True when the wallet was imported instead of HD-derived from DEPLOY_MNEMONIC. */
  importedWallet?: boolean;
  /** Registered GameArena Pass username on Celo (GamePass contract). */
  gamePassUsername?: string | null;
  gamePassRegisteredAt?: string | null;
  /** On-chain ERC-8004 Identity Registry token id (Celo), once minted. */
  erc8004AgentId?: string | null;
  erc8004RegisteredAt?: string | null;
}

export function agentDir(agentsRoot: string, deployId: string): string {
  return resolve(agentsRoot, deployId);
}

export function writeAgentMeta(
  agentsRoot: string,
  meta: AgentWalletMeta,
): string {
  const dir = agentDir(agentsRoot, meta.deployId);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "meta.json");
  writeFileSync(path, JSON.stringify(meta, null, 2), "utf8");
  return dir;
}

export function readAgentMeta(
  agentsRoot: string,
  deployId: string,
): AgentWalletMeta {
  const path = resolve(agentDir(agentsRoot, deployId), "meta.json");
  return JSON.parse(readFileSync(path, "utf8")) as AgentWalletMeta;
}
