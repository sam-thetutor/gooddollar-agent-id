import { describe, expect, it, vi } from "vitest";
import {
  createProductClankLink,
  registerWithProductClank,
} from "./productclank-provision.js";

const AGENT = "0x85C53da868750F657D0280Be92b7350dB1292b09" as const;

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("registerWithProductClank", () => {
  it("returns the api key and strips a leading @ from the handle", async () => {
    const fetchImpl = mockFetch(201, {
      success: true,
      api_key: "pck_live_abc",
      agent: { id: "agent-uuid" },
    });
    const result = await registerWithProductClank({
      displayName: "Test Agent",
      agentAddress: AGENT,
      erc8004AgentId: "9772",
      xHandle: "@ole_ai_agent",
      fetchImpl,
    });
    expect(result).toEqual({
      apiKey: "pck_live_abc",
      productClankAgentId: "agent-uuid",
    });

    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.productclank.com/api/v1/agents/register");
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.x_handle).toBe("ole_ai_agent");
    expect(payload.wallet_address).toBe(AGENT);
    expect(payload.erc8004_agent_id).toBe("9772");
  });

  it("throws with the server message on conflict", async () => {
    const fetchImpl = mockFetch(409, {
      success: false,
      error: "Agent name already exists",
    });
    await expect(
      registerWithProductClank({
        displayName: "Test Agent",
        agentAddress: AGENT,
        erc8004AgentId: "9772",
        xHandle: "ole_ai_agent",
        fetchImpl,
      }),
    ).rejects.toThrow(/409.*Agent name already exists/);
  });

  it("returns a fresh linking URL", async () => {
    const fetchImpl = mockFetch(200, {
      success: true,
      already_linked: false,
      link_url: "https://app.productclank.com/link/agent?token=abc",
      expires_at: "2026-08-20T00:00:00.000Z",
    });
    const link = await createProductClankLink({ apiKey: "pck_live_x", fetchImpl });
    expect(link).toEqual({
      alreadyLinked: false,
      linkUrl: "https://app.productclank.com/link/agent?token=abc",
      expiresAt: "2026-08-20T00:00:00.000Z",
      linkedUserName: null,
    });
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.productclank.com/api/v1/agents/create-link");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer pck_live_x",
    });
  });

  it("reports an already-linked agent", async () => {
    const fetchImpl = mockFetch(200, {
      success: true,
      already_linked: true,
      user_name: "Samuel",
    });
    const link = await createProductClankLink({ apiKey: "pck_live_x", fetchImpl });
    expect(link.alreadyLinked).toBe(true);
    expect(link.linkedUserName).toBe("Samuel");
    expect(link.linkUrl).toBeNull();
  });

  it("rejects an empty handle before hitting the network", async () => {
    const fetchImpl = mockFetch(201, { success: true, api_key: "x" });
    await expect(
      registerWithProductClank({
        displayName: "Test Agent",
        agentAddress: AGENT,
        erc8004AgentId: "9772",
        xHandle: "  @ ",
        fetchImpl,
      }),
    ).rejects.toThrow(/X handle is required/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
