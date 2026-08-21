/** Shared ProductClank agent API helpers (participate + campaigns). */

export const PRODUCTCLANK_API_BASE = "https://api.productclank.com/api/v1";

export const BOOST_ACTION_CREDITS: Record<string, number> = {
  replies: 200,
  reply: 200,
  likes: 300,
  like: 300,
  reposts: 300,
  repost: 300,
};

export interface ProductClankAgentProfile {
  success: boolean;
  error?: string;
  message?: string;
  credits?: number;
  linkedUserName?: string | null;
  linkedUserId?: string | null;
  xHandle?: string | null;
  agentName?: string | null;
}

export interface ProductClankProductSearchHit {
  id: string;
  name?: string;
  tagline?: string;
  url?: string;
}

export interface ProductClankBoostResult {
  success: boolean;
  error?: string;
  message?: string;
  campaign?: {
    id?: string;
    campaign_number?: string;
    campaignNumber?: string;
    platform?: string;
    url?: string;
  };
  post?: {
    url?: string;
    text?: string;
    author?: string;
  };
  items_generated?: number;
  itemsGenerated?: number;
  credits?: {
    credits_used?: number;
    creditsUsed?: number;
    credits_remaining?: number;
    creditsRemaining?: number;
  };
  is_reboost?: boolean;
  isReboost?: boolean;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export function normalizeBoostAction(raw: unknown): string | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (value === "reply" || value === "replies") return "replies";
  if (value === "like" || value === "likes") return "likes";
  if (value === "repost" || value === "reposts") return "reposts";
  return null;
}

export function boostCreditsForAction(action: string): number {
  return BOOST_ACTION_CREDITS[action] ?? 0;
}

export async function fetchProductClankAgentProfile(input: {
  apiKey: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProductClankAgentProfile> {
  const fetchFn = input.fetchImpl ?? fetch;
  const base = (input.apiBase ?? PRODUCTCLANK_API_BASE).replace(/\/$/, "");
  const res = await fetchFn(`${base}/agents/me`, {
    headers: authHeaders(input.apiKey),
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

export function isProductClankOwnerLinked(profile: ProductClankAgentProfile): boolean {
  return Boolean(profile.linkedUserName || profile.linkedUserId);
}

export async function searchProductClankProducts(input: {
  apiKey: string;
  query: string;
  limit?: number;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ success: boolean; products: ProductClankProductSearchHit[]; error?: string }> {
  const fetchFn = input.fetchImpl ?? fetch;
  const base = (input.apiBase ?? PRODUCTCLANK_API_BASE).replace(/\/$/, "");
  const q = input.query.trim();
  if (!q) {
    return { success: false, products: [], error: "query is required" };
  }
  const params = new URLSearchParams({ q, limit: String(input.limit ?? 5) });
  const res = await fetchFn(`${base}/agents/products/search?${params}`, {
    headers: authHeaders(input.apiKey),
  });
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    products?: Array<Record<string, unknown>>;
    error?: string;
    message?: string;
  } | null;
  if (!res.ok || !body?.success) {
    return {
      success: false,
      products: [],
      error: body?.message ?? body?.error ?? `HTTP ${res.status}`,
    };
  }
  const products = (body.products ?? []).map((p) => ({
    id: String(p.id ?? ""),
    name: p.name as string | undefined,
    tagline: p.tagline as string | undefined,
    url: p.url as string | undefined,
  }));
  return { success: true, products: products.filter((p) => p.id) };
}

export const DISCOVER_CREATE_CREDITS = 10;
export const DISCOVER_GENERATE_CREDITS_PER_POST = 12;

export async function boostProductClankPost(input: {
  apiKey: string;
  postUrl: string;
  actionType: string;
  productId?: string;
  replyGuidelines?: string;
  postText?: string;
  postAuthor?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProductClankBoostResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const base = (input.apiBase ?? PRODUCTCLANK_API_BASE).replace(/\/$/, "");
  const payload: Record<string, string> = {
    post_url: input.postUrl.trim(),
    action_type: input.actionType,
  };
  if (input.productId?.trim()) payload.product_id = input.productId.trim();
  if (input.replyGuidelines?.trim()) payload.reply_guidelines = input.replyGuidelines.trim();
  if (input.postText?.trim()) payload.post_text = input.postText.trim();
  if (input.postAuthor?.trim()) payload.post_author = input.postAuthor.trim();

  const res = await fetchFn(`${base}/agents/campaigns/boost`, {
    method: "POST",
    headers: authHeaders(input.apiKey),
    body: JSON.stringify(payload),
  });
  return (await res.json().catch(() => ({
    success: false,
    error: "invalid_response",
    message: `Non-JSON response (HTTP ${res.status})`,
  }))) as ProductClankBoostResult;
}
