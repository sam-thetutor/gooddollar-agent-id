/** Parse comma- or newline-separated HTTP(S) proxy URLs. */
export function parseGamearenaProxyPool(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Stable proxy pick from deploy id (same agent always gets the same slot). */
export function pickGamearenaProxyForDeploy(
  deployId: string,
  pool: string[],
): string | undefined {
  if (pool.length === 0) return undefined;
  let h = 0;
  for (let i = 0; i < deployId.length; i++) {
    h = (h * 31 + deployId.charCodeAt(i)) >>> 0;
  }
  return pool[h % pool.length];
}

export function resolveGamearenaProxy(
  deployId: string,
  config: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const direct =
    config.GAMEARENA_PROXY?.trim() ||
    env.GAMEARENA_PROXY?.trim();
  if (direct) return direct;

  const template = env.GAMEARENA_PROXY_TEMPLATE?.trim();
  if (template) {
    return template.includes("{deployId}")
      ? template.replaceAll("{deployId}", deployId)
      : template;
  }

  return pickGamearenaProxyForDeploy(
    deployId,
    parseGamearenaProxyPool(env.GAMEARENA_PROXY_POOL),
  );
}
