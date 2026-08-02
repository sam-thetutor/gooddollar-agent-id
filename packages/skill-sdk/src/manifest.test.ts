import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentManifest, parseAgentManifest } from "./manifest.js";

test("buildAgentManifest produces valid v1 manifest", () => {
  const manifest = buildAgentManifest({
    deployId: "abc123",
    displayName: "Test Agent",
    agentAddress: "0x0000000000000000000000000000000000000001",
    rpcUrl: "https://forno.celo.org",
    apiBase: "https://goodagentids.xyz",
    host: { url: "http://127.0.0.1:3002", secret: "secret" },
    skills: [
      {
        skillId: "dev/hello-world",
        folder: "hello-world",
        entry: "dist/plugin.js",
        config: { FOO: "bar" },
        enabled: true,
        apiVersion: 1,
      },
    ],
  });

  assert.equal(manifest.version, 1);
  assert.equal(manifest.skills[0]?.config.FOO, "bar");
  assert.doesNotThrow(() => parseAgentManifest(manifest));
});
