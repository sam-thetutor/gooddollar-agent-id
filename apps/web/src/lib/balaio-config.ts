import { parseSkillConfig } from "./skill-config.js";

export const BALAIO_SKILL_ID = "work/marketplace/balaio_worker";

export type BalaioRole = "worker" | "creator" | "approver";

export function isBalaioSkill(skillId?: string | null): boolean {
  return skillId === BALAIO_SKILL_ID;
}

export function isBalaioRoleEnabled(
  config: Record<string, string> = {},
  role: BalaioRole,
): boolean {
  const key =
    role === "worker"
      ? "ENABLE_WORKER"
      : role === "creator"
        ? "ENABLE_CREATE"
        : "ENABLE_APPROVE";
  const raw = config[key]?.trim().toLowerCase();
  if (raw === undefined || raw === "") {
    return role === "worker";
  }
  return raw === "1" || raw === "true" || raw === "yes";
}

export function balaioRoleSummary(config: Record<string, string> = {}): string {
  const roles: string[] = [];
  if (isBalaioRoleEnabled(config, "worker")) roles.push("Worker");
  if (isBalaioRoleEnabled(config, "creator")) roles.push("Creator");
  if (isBalaioRoleEnabled(config, "approver")) roles.push("Approver");
  return roles.length > 0 ? roles.join(" · ") : "Worker";
}

/** Escrow + 1% creation fee in human G$ units (approx when token is G$). */
export function estimateBalaioEscrowGs(
  config: Record<string, string> = {},
): number | null {
  if (!isBalaioRoleEnabled(config, "creator")) return null;
  const explicit = Number(config.CREATE_ESCROW_BUDGET_GS ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const reward = Number(config.CREATE_REWARD ?? 0);
  const slots = Math.max(1, Number(config.CREATE_SLOTS ?? 1));
  if (!Number.isFinite(reward) || reward <= 0) return null;
  return Math.ceil(reward * slots * 1.02 * 100) / 100;
}

export function balaioFundingHint(
  config: Record<string, string> = {},
  baseGs = 200,
): string | null {
  const escrow = estimateBalaioEscrowGs(config);
  if (escrow == null) return null;
  return `Funds agent with ~${baseGs + escrow} G$ (${baseGs} base + ${escrow} escrow)`;
}

export function parseBalaioConfig(configuration?: string | null): Record<string, string> {
  return parseSkillConfig(configuration);
}
