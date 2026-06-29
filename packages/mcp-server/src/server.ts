import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getClaimEligibility,
  getDailyStats,
  getGBalance,
  getVerifyStatus,
  pingChain,
} from "@g-copilot/chain";
import { GCopilotError } from "@g-copilot/shared";

const SERVER_NAME = "gooddollar-mcp";
const SERVER_VERSION = "0.1.0";

const walletInput = {
  type: "object" as const,
  properties: {
    wallet: {
      type: "string",
      description: "0x-prefixed Celo wallet address to inspect.",
    },
  },
  required: ["wallet"],
};

function jsonResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  const code = error instanceof GCopilotError ? error.code : "UNKNOWN";
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: code, message }, null, 2),
      },
    ],
    isError: true,
  };
}

function requireWallet(args: Record<string, unknown> | undefined): string {
  const wallet = args?.wallet;
  if (typeof wallet !== "string" || wallet.length === 0) {
    throw new GCopilotError("Missing required 'wallet' argument.", "BAD_INPUT");
  }
  return wallet;
}

export function createMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "gooddollar_ping",
        description: "Check MCP server and Celo RPC connectivity.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "gooddollar_get_balance",
        description:
          "Get the G$ token balance for a Celo wallet address. Returns raw and human-readable amounts.",
        inputSchema: walletInput,
      },
      {
        name: "gooddollar_verify_status",
        description:
          "Check whether a wallet is a verified (whitelisted) GoodDollar identity on Celo, its whitelisted root, and expiry.",
        inputSchema: walletInput,
      },
      {
        name: "gooddollar_claim_eligibility",
        description:
          "Check whether a wallet can claim its daily UBI right now and how much G$ is currently entitled.",
        inputSchema: walletInput,
      },
      {
        name: "gooddollar_get_daily_stats",
        description:
          "Get GoodDollar UBI cycle stats on Celo (current UBI day).",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "gooddollar_ping": {
          const chainOk = await pingChain();
          return jsonResult({
            mcp: "ok",
            chain: chainOk ? "ok" : "unreachable",
          });
        }
        case "gooddollar_get_balance":
          return jsonResult(await getGBalance(requireWallet(args)));
        case "gooddollar_verify_status":
          return jsonResult(await getVerifyStatus(requireWallet(args)));
        case "gooddollar_claim_eligibility":
          return jsonResult(await getClaimEligibility(requireWallet(args)));
        case "gooddollar_get_daily_stats":
          return jsonResult(await getDailyStats());
        default:
          return errorResult(
            new GCopilotError(`Unknown tool: ${name}`, "UNKNOWN_TOOL"),
          );
      }
    } catch (error) {
      return errorResult(error);
    }
  });

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
