#!/usr/bin/env node
import { loadManifestFromFile } from "./manifest.js";
import { runAgentRuntime } from "./runtime.js";

function parseArgs(argv: string[]): { manifestPath: string } {
  let manifestPath = "manifest.json";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest" || arg === "-m") {
      manifestPath = argv[i + 1] ?? manifestPath;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: goodagent-runtime --manifest <path>

Runs one PM2 agent process that loads skills as plugins from manifest.json.`);
      process.exit(0);
    }
  }
  return { manifestPath };
}

async function main(): Promise<void> {
  const { manifestPath } = parseArgs(process.argv.slice(2));
  const manifest = loadManifestFromFile(manifestPath);
  const runtime = await runAgentRuntime(manifestPath, manifest);

  const shutdown = async (signal: string) => {
    console.log(`[runtime] ${signal} — stopping`);
    await runtime.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[runtime] fatal", err);
  process.exit(1);
});
