#!/usr/bin/env node
import { runMcpServer } from "./server.js";

runMcpServer().catch((error: unknown) => {
  console.error("MCP server failed:", error);
  process.exit(1);
});
