export type WidgetSessionTab = "deploy" | "vouch" | "dashboard";

export interface WidgetSession {
  tab?: WidgetSessionTab;
  /** Active provisioning job on the Deploy tab. */
  deployActiveId?: string;
  /** Selected deploy on the Verify tab. */
  vouchDeployId?: string;
  vouchAgentAddress?: string;
  /** Selected deploy on the Dashboard tab. */
  dashboardDeployId?: string;
  /** @deprecated Use tab-specific fields above. Kept for migration. */
  deployId?: string;
  /** @deprecated Use vouchAgentAddress. Kept for migration. */
  agentAddress?: string;
}

function storageKey(partnerId: string | undefined, owner: string): string {
  return `ga-widget:${partnerId ?? "default"}:${owner.toLowerCase()}`;
}

/** Normalize legacy single deployId/agentAddress into tab-specific fields. */
export function normalizeWidgetSession(
  session: WidgetSession | null,
): WidgetSession | null {
  if (!session) return null;
  const normalized: WidgetSession = { ...session };
  if (!normalized.vouchDeployId && session.deployId) {
    normalized.vouchDeployId = session.deployId;
  }
  if (!normalized.vouchAgentAddress && session.agentAddress) {
    normalized.vouchAgentAddress = session.agentAddress;
  }
  if (!normalized.dashboardDeployId && session.deployId) {
    normalized.dashboardDeployId = session.deployId;
  }
  if (!normalized.deployActiveId && session.deployId && session.tab === "deploy") {
    normalized.deployActiveId = session.deployId;
  }
  return normalized;
}

export function loadWidgetSession(
  partnerId: string | undefined,
  owner: string | undefined,
): WidgetSession | null {
  if (typeof window === "undefined" || !owner) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(partnerId, owner));
    if (!raw) return null;
    return normalizeWidgetSession(JSON.parse(raw) as WidgetSession);
  } catch {
    return null;
  }
}

export function saveWidgetSession(
  partnerId: string | undefined,
  owner: string | undefined,
  session: WidgetSession,
): void {
  if (typeof window === "undefined" || !owner) return;
  try {
    sessionStorage.setItem(
      storageKey(partnerId, owner),
      JSON.stringify(session),
    );
  } catch {
    // ignore quota / private mode
  }
}
