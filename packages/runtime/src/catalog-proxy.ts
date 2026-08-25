export function catalogProxyConfigured(url: string, secret: string): boolean {
  return Boolean(url.trim() && secret.trim());
}

export async function proxyCatalogRequest(opts: {
  catalogUrl: string;
  catalogSecret: string;
  path: string;
  method: "GET" | "POST";
  query?: string;
  body?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: unknown }> {
  const base = opts.catalogUrl.replace(/\/$/, "");
  const qs = opts.query ? `?${opts.query}` : "";
  const url = `${base}/internal/catalog${opts.path}${qs}`;
  const fetchFn = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(url, {
      method: opts.method,
      headers: {
        authorization: `Bearer ${opts.catalogSecret}`,
        ...(opts.method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: opts.method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.json().catch(() => ({ error: `catalog replied ${res.status}` }));
    return { status: res.status, body };
  } catch (err) {
    return {
      status: 502,
      body: {
        error: "CATALOG_UNREACHABLE",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
