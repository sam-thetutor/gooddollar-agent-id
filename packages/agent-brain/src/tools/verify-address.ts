import type { BrainTool } from "../types.js";

/**
 * `verify_address` — the flagship trust tool. Checks whether an address is a
 * human-backed GoodAgent via the public `GET /agent/verify/:address` API,
 * so the brain can warn users about unverified or revoked agents.
 */
export interface VerifyAddressToolOptions {
  /** GoodAgent API base, e.g. `https://goodagent.click/api`. */
  apiBase: string;
  fetchImpl?: typeof fetch;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function createVerifyAddressTool(
  options: VerifyAddressToolOptions,
): BrainTool {
  const base = options.apiBase.replace(/\/$/, "");
  const fetchFn = options.fetchImpl ?? fetch;

  return {
    name: "verify_address",
    description:
      "Check whether an Ethereum/Celo address is a verified, human-backed GoodAgent. " +
      "Returns whether it was found, whether the credential is currently valid, " +
      "the failure reason if not (e.g. revoked, insufficient_bond), and the operator address.",
    parameters: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "The 0x-prefixed agent address to verify.",
        },
      },
      required: ["address"],
    },
    async execute(args) {
      const address = typeof args.address === "string" ? args.address.trim() : "";
      if (!ADDRESS_RE.test(address)) {
        return {
          error: "Invalid address — expected a 0x-prefixed 40-hex-char address.",
        };
      }
      const res = await fetchFn(`${base}/agent/verify/${address}`);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { error: `verify API returned ${res.status}: ${text.slice(0, 200)}` };
      }
      return (await res.json()) as Record<string, unknown>;
    },
  };
}
