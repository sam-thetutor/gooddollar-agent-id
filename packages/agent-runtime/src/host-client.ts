import type { HostClient, SkillActivityEvent } from "@goodagent/skill-sdk";

export interface HostClientOptions {
  deployId: string;
  hostUrl: string;
  hostSecret?: string;
  fetchImpl?: typeof fetch;
}

export function createHostClient(opts: HostClientOptions): HostClient {
  const base = opts.hostUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.hostSecret) {
    headers.authorization = `Bearer ${opts.hostSecret}`;
  }
  const fetchFn = opts.fetchImpl ?? fetch;

  return {
    async heartbeat() {
      const res = await fetchFn(`${base}/deploy/${opts.deployId}/heartbeat`, {
        method: "POST",
        headers,
        body: "{}",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`heartbeat failed: ${res.status} ${text}`);
      }
    },
    async reportActivity(event: SkillActivityEvent) {
      const res = await fetchFn(`${base}/deploy/${opts.deployId}/activity`, {
        method: "POST",
        headers,
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`activity report failed: ${res.status} ${text}`);
      }
    },
  };
}
