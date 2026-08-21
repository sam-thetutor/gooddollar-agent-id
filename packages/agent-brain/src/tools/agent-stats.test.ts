import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAgentStatsTool } from "./agent-stats.js";

function mockFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as Response) as typeof fetch;
}

describe("agent_stats tool", () => {
  it("returns trimmed per-skill stats with recent matches capped", async () => {
    const tool = createAgentStatsTool({
      hostUrl: "http://127.0.0.1:3010/",
      deployId: "dep1",
      fetchImpl: mockFetch(200, {
        displayName: "My ACTION-ORDER Agent",
        status: "running",
        agentAddress: "0x85C53da868750F657D0280Be92b7350dB1292b09",
        pm2: { online: true, uptimeMs: 1000 },
        skills: [
          {
            skillId: "gaming/wagering/gamearena_1v1",
            status: "installed",
            stats: {
              gamesPlayed: 337,
              wins: 156,
              losses: 181,
              matchesToday: 29,
              summary: "lifetime 109W/128L · today 29/128 matches",
              matches: [1, 2, 3, 4, 5].map((n) => ({ matchId: `m${n}` })),
            },
          },
        ],
      }),
    });

    const result = (await tool.execute({})) as {
      displayName: string;
      processOnline: boolean;
      skills: Array<{ gamesPlayed: number; recentMatches: unknown[] }>;
    };
    assert.equal(result.displayName, "My ACTION-ORDER Agent");
    assert.equal(result.processOnline, true);
    assert.equal(result.skills[0].gamesPlayed, 337);
    assert.equal(result.skills[0].recentMatches.length, 3);
  });

  it("surfaces host errors without throwing", async () => {
    const tool = createAgentStatsTool({
      hostUrl: "http://127.0.0.1:3010",
      deployId: "dep1",
      fetchImpl: mockFetch(500, {}),
    });
    const result = (await tool.execute({})) as { error: string };
    assert.ok(result.error.includes("500"));
  });
});
