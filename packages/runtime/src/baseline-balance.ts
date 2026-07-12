import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentDir } from "./wallet.js";

export type BaselineSource = "snapshot" | "config" | "manual";

export interface BaselineRecord {
  balanceGs: number;
  setAt: string;
  source: BaselineSource;
}

const BASELINE_FILE = "baseline.json";

function baselinePath(agentsRoot: string, deployId: string): string {
  return resolve(agentDir(agentsRoot, deployId), BASELINE_FILE);
}

export function readBaseline(
  agentsRoot: string,
  deployId: string,
): BaselineRecord | null {
  const path = baselinePath(agentsRoot, deployId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BaselineRecord;
  } catch {
    return null;
  }
}

export function writeBaseline(
  agentsRoot: string,
  deployId: string,
  record: BaselineRecord,
): void {
  const path = baselinePath(agentsRoot, deployId);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

/** Persist baseline only if none exists yet. */
export function writeBaselineIfAbsent(
  agentsRoot: string,
  deployId: string,
  balanceGs: number,
  source: BaselineSource,
): BaselineRecord | null {
  const existing = readBaseline(agentsRoot, deployId);
  if (existing) return existing;
  const record: BaselineRecord = {
    balanceGs,
    setAt: new Date().toISOString(),
    source,
  };
  writeBaseline(agentsRoot, deployId, record);
  return record;
}

export function resolveBaseline(
  agentsRoot: string,
  deployId: string,
  configBaselineGs?: string | null,
): BaselineRecord | null {
  const file = readBaseline(agentsRoot, deployId);
  if (file) return file;

  const fromConfig = configBaselineGs ? Number(configBaselineGs) : NaN;
  if (Number.isFinite(fromConfig) && fromConfig >= 0) {
    const record: BaselineRecord = {
      balanceGs: fromConfig,
      setAt: new Date().toISOString(),
      source: "config",
    };
    writeBaseline(agentsRoot, deployId, record);
    return record;
  }

  return null;
}
