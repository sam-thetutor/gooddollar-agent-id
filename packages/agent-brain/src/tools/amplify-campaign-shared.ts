export const PRODUCTCLANK_API_BASE = "https://api.productclank.com/api/v1";

export interface AmplifyCampaignToolOptions {
  apiKey: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

export const BOOST_ACTION_CREDITS: Record<string, number> = {
  replies: 200,
  likes: 300,
  reposts: 300,
};

export const DISCOVER_CREATE_CREDITS = 10;
export const DISCOVER_GENERATE_CREDITS_PER_POST = 12;
export const CONTENT_CAMPAIGN_CREDITS = 1000;
export const REGENERATE_CREDITS_PER_REPLY = 5;
export const REVIEW_POSTS_CREDITS_PER_POST = 2;

export interface AgentProfile {
  success: boolean;
  error?: string;
  message?: string;
  credits?: number;
  linkedUserName?: string | null;
  linkedUserId?: string | null;
  xHandle?: string | null;
  agentName?: string | null;
}

export function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export function apiBase(options: AmplifyCampaignToolOptions): string {
  return (options.apiBase ?? PRODUCTCLANK_API_BASE).replace(/\/$/, "");
}

export async function fetchAgentProfile(
  options: AmplifyCampaignToolOptions,
): Promise<AgentProfile> {
  const fetchFn = options.fetchImpl ?? fetch;
  const res = await fetchFn(`${apiBase(options)}/agents/me`, {
    headers: authHeaders(options.apiKey),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || body?.success === false) {
    return {
      success: false,
      error: String(body?.error ?? "request_failed"),
      message: String(body?.message ?? `HTTP ${res.status}`),
    };
  }

  const agent = (body?.agent ?? body) as Record<string, unknown>;
  const user =
    (body?.user as Record<string, unknown> | undefined) ??
    (body?.linked_user as Record<string, unknown> | undefined);
  const creditsRaw =
    body?.credits ??
    body?.credit_balance ??
    user?.credits ??
    user?.credit_balance;

  return {
    success: true,
    credits: typeof creditsRaw === "number" ? creditsRaw : Number(creditsRaw) || 0,
    linkedUserName:
      (user?.name as string | undefined) ??
      (user?.user_name as string | undefined) ??
      (body?.user_name as string | undefined) ??
      null,
    linkedUserId:
      (user?.id as string | undefined) ??
      (body?.user_id as string | undefined) ??
      null,
    xHandle:
      (agent?.x_handle as string | undefined) ??
      (body?.x_handle as string | undefined) ??
      null,
    agentName: (agent?.name as string | undefined) ?? null,
  };
}

export function isOwnerLinked(profile: AgentProfile): boolean {
  return Boolean(profile.linkedUserName || profile.linkedUserId);
}

export function linkRequiredMessage(): Record<string, unknown> {
  return {
    error: "account_not_linked",
    message:
      "This agent is not linked to a ProductClank account yet. The owner must open " +
      "the deploy dashboard and click “Link ProductClank account” so campaign costs " +
      "bill their credit balance. No agent credit purchase is needed.",
  };
}

export async function requireLinkedProfile(
  options: AmplifyCampaignToolOptions,
): Promise<AgentProfile | Record<string, unknown>> {
  const profile = await fetchAgentProfile(options);
  if (!profile.success) {
    return { error: profile.message ?? profile.error ?? "account check failed" };
  }
  if (!isOwnerLinked(profile)) return linkRequiredMessage();
  return profile;
}

export function confirmationRequiredMessage(action: string): Record<string, unknown> {
  return {
    error: "confirmation_required",
    message:
      `Call the preview tool first, tell the operator the credit cost, then retry ` +
      `${action} with confirmed=true only after they explicitly approve.`,
  };
}

export function isConfirmed(args: Record<string, unknown>): boolean {
  return args.confirmed === true || String(args.confirmed).toLowerCase() === "true";
}

export async function productClankJson<T extends Record<string, unknown>>(
  options: AmplifyCampaignToolOptions,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  const fetchFn = options.fetchImpl ?? fetch;
  const res = await fetchFn(`${apiBase(options)}${path}`, {
    ...init,
    headers: { ...authHeaders(options.apiKey), ...(init?.headers as Record<string, string>) },
  });
  const body = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, body };
}

export interface CampaignSummary {
  id: string;
  number?: string;
  title?: string;
  status?: string;
  adminUrl?: string;
  url?: string;
}

export function mapCampaignSummary(raw: Record<string, unknown>): CampaignSummary {
  return {
    id: String(raw.id ?? ""),
    number: String(raw.campaign_number ?? raw.campaignNumber ?? "") || undefined,
    title: raw.title as string | undefined,
    status: raw.status as string | undefined,
    adminUrl: String(raw.admin_url ?? raw.adminUrl ?? "") || undefined,
    url: String(raw.url ?? "") || undefined,
  };
}

/** Resolve UUID, CP-042, or title fragment to a campaign id owned by this agent. */
export async function resolveCampaignId(
  options: AmplifyCampaignToolOptions,
  ref: string,
): Promise<{ id: string; campaign: CampaignSummary } | { error: string }> {
  const query = ref.trim();
  if (!query) return { error: "campaignId is required" };
  if (/^[0-9a-f-]{36}$/i.test(query)) {
    return { id: query, campaign: { id: query } };
  }

  const { ok, body } = await productClankJson<{
    success?: boolean;
    campaigns?: Array<Record<string, unknown>>;
  }>(options, "/agents/campaigns?limit=100");

  if (!ok || !body?.success) {
    return { error: "Could not list campaigns to resolve id" };
  }

  const q = query.toLowerCase();
  const matches = (body.campaigns ?? [])
    .map(mapCampaignSummary)
    .filter((c) => c.id)
    .filter(
      (c) =>
        c.number?.toLowerCase() === q ||
        c.id.toLowerCase() === q ||
        (c.title?.toLowerCase().includes(q) ?? false),
    );

  if (matches.length === 0) {
    return { error: `No campaign matched "${query}" — use amplify_my_campaigns to list ids` };
  }
  if (matches.length > 1) {
    return {
      error: `Multiple campaigns matched "${query}": ${matches
        .slice(0, 3)
        .map((m) => m.number ?? m.title)
        .join(", ")} — pass a specific campaignId`,
    };
  }
  return { id: matches[0]!.id, campaign: matches[0]! };
}

export function parseStringArray(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
