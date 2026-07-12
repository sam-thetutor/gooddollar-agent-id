import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { mnemonicToAccount } from "viem/accounts";
import { bytesToHex } from "viem";
import type { Address, LocalAccount } from "viem";

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

export interface AgentWalletMeta {
  deployId: string;
  displayName: string;
  template: string;
  address: Address;
  derivationIndex: number;
  createdAt: string;
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
