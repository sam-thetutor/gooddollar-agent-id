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
} from "@goodagent/chain";
import {
  credentialFromWire,
  verifyAgentIdLive,
  verifyResultToWire,
  type AgentIdCredential,
  type AgentIdCredentialWire,
} from "@goodagent/agent-id";
import { AgentIdError } from "@goodagent/shared";

const SERVER_NAME = "gooddollar-mcp";
const SERVER_VERSION = "0.1.0";

/**
 * Resolves a stored Agent ID credential by agent address. Injected by hosts
 * that have storage (e.g. the API); omitted for the stateless standalone CLI,
 * where `gooddollar_verify_agent` requires a full `credential` argument instead.
 */
export type AgentLookup = (
  agent: string,
) => Promise<AgentIdCredential | null> | AgentIdCredential | null;

export interface McpServerOptions {
  agentLookup?: AgentLookup;
}

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
  const code = error instanceof AgentIdError ? error.code : "UNKNOWN";
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
    throw new AgentIdError("Missing required 'wallet' argument.", "BAD_INPUT");
  }
  return wallet;
}

export function createMcpServer(options: McpServerOptions = {}): Server {
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
      {
        name: "gooddollar_verify_agent",
        description:
          "Verify a GoodDollar Agent ID — confirm an AI agent is vouched for by a real, currently-verified GoodDollar human, is not revoked on-chain (fails with 'revoked'), AND still carries its required refundable G$ bond on-chain (a withdrawn bond fails with 'insufficient_bond'). Pass either an 'agent' address (to look up a stored credential) or a full 'credential' object. Returns validity, the human root, expiry, the live bond, and whether the bond/revocation were checked. NOTE: this proves a human vouches for the agent address — it does NOT prove the party you're talking to controls that address (use an agent-signed AgentAuth for that).",
        inputSchema: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description:
                "0x agent address to look up a stored Agent ID credential for.",
            },
            credential: {
              type: "object",
              description:
                "A full signed Agent ID credential (wire form) to verify directly.",
            },
          },
        },
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
        case "gooddollar_verify_agent": {
          const agent = typeof args?.agent === "string" ? args.agent : undefined;
          const credentialArg = args?.credential;

          let credential: AgentIdCredential | null = null;
          if (credentialArg && typeof credentialArg === "object") {
            credential = credentialFromWire(
              credentialArg as AgentIdCredentialWire,
            );
          } else if (agent && options.agentLookup) {
            credential = await options.agentLookup(agent);
            if (!credential) {
              return jsonResult({
                found: false,
                valid: false,
                reason: "not_found",
                agent,
              });
            }
          } else {
            throw new AgentIdError(
              "Provide a 'credential' object, or an 'agent' address (address lookup is not available in this context).",
              "BAD_INPUT",
            );
          }

          // All live checks on by default: human root, on-chain revocation,
          // and the G$ bond (fails with `revoked` / `insufficient_bond`).
          const result = await verifyAgentIdLive(credential);
          return jsonResult({ found: true, ...verifyResultToWire(result) });
        }
        default:
          return errorResult(
            new AgentIdError(`Unknown tool: ${name}`, "UNKNOWN_TOOL"),
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
