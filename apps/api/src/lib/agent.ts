import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@g-copilot/mcp-server";
import { getAgentCredential } from "@g-copilot/db";
import {
  credentialFromWire,
  type AgentIdCredential,
} from "@g-copilot/agent-id";
import type { ChatMessage } from "@g-copilot/shared";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

const PROVIDER = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase();
const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 300);

// ---------------------------------------------------------------------------
// LLM provider — OpenAI (paid, function-calling) or a local OpenAI-compatible
// server such as Ollama (free, context-injection). Ollama is the default.
// ---------------------------------------------------------------------------

interface Provider {
  client: OpenAI;
  model: string;
  /** Whether the model should drive its own tool calls (OpenAI) or we
   *  pre-fetch on-chain facts and inject them into the prompt (local). */
  useTools: boolean;
}

export function isLlmConfigured(): boolean {
  if (PROVIDER === "openai") return Boolean(process.env.OPENAI_API_KEY);
  return true; // local provider needs no key
}

function getProvider(): Provider {
  if (PROVIDER === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    return {
      client: new OpenAI({ apiKey }),
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      useTools: true,
    };
  }
  // Ollama / any OpenAI-compatible local server.
  const baseURL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1";
  return {
    client: new OpenAI({ baseURL, apiKey: "ollama" }),
    model: process.env.OLLAMA_MODEL ?? "qwen2.5:3b-instruct",
    useTools: false,
  };
}

// ---------------------------------------------------------------------------
// MCP client (connected to our own MCP server, in-process via memory transport)
// ---------------------------------------------------------------------------

let clientPromise: Promise<Client> | null = null;

/** DB-backed lookup so the in-process MCP `gooddollar_verify_agent` tool can
 *  resolve a stored credential by agent address. */
async function agentLookup(agent: string): Promise<AgentIdCredential | null> {
  const rec = await getAgentCredential(agent);
  if (!rec || rec.revokedAt) return null;
  return credentialFromWire({
    fields: {
      agent: rec.agent,
      operator: rec.operator,
      humanRoot: rec.humanRoot,
      scopes: rec.scopes,
      stake: rec.stake,
      budgetCap: rec.budgetCap,
      nonce: rec.nonce,
      issuedAt: rec.issuedAt,
      expiresAt: rec.expiresAt,
    },
    signature: rec.signature,
    chainId: rec.chainId,
    verifyingContract: rec.verifyingContract,
  });
}

async function getMcpClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const server = createMcpServer({ agentLookup });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      const client = new Client(
        { name: "g-copilot-api", version: "0.1.0" },
        { capabilities: {} },
      );
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      return client;
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

function toolText(result: unknown): string {
  const content = ((result as { content?: unknown })?.content ?? []) as Array<{
    type: string;
    text?: string;
  }>;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

async function safeCall(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await callTool(client, name, args));
  } catch {
    return null;
  }
}

function fmtG(value: unknown): string {
  const n = Number(value);
  return Number.isNaN(n)
    ? String(value)
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  return toolText(result);
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function basePrompt(wallet?: string): string {
  return [
    "You are G$ Copilot, a helpful assistant for GoodDollar (G$), a Universal Basic",
    "Income token on the Celo blockchain where verified humans claim free G$ daily.",
    wallet ? `Connected wallet: ${wallet}.` : "No wallet connected.",
    "Claiming/sending G$ happens via buttons in the app; you cannot send transactions.",
    "Answer in at most 3 short sentences. Never invent numbers. No financial advice.",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Context injection (local provider): pre-fetch live on-chain facts via MCP
// ---------------------------------------------------------------------------

async function buildFacts(
  client: Client,
  wallet: string | undefined,
): Promise<string> {
  const [stats, balance, verify, claim] = await Promise.all([
    safeCall(client, "gooddollar_get_daily_stats", {}),
    wallet ? safeCall(client, "gooddollar_get_balance", { wallet }) : null,
    wallet ? safeCall(client, "gooddollar_verify_status", { wallet }) : null,
    wallet ? safeCall(client, "gooddollar_claim_eligibility", { wallet }) : null,
  ]);

  const parts: string[] = [];
  if (wallet) {
    if (balance) parts.push(`G$ balance: ${fmtG(balance.balanceFormatted)} G$`);
    if (verify)
      parts.push(`identity verified: ${verify.isWhitelisted ? "yes" : "no"}`);
    if (claim) {
      parts.push(`can claim right now: ${claim.eligible ? "yes" : "no"}`);
      parts.push(
        `today's claimable amount: ${fmtG(claim.claimAmountFormatted)} G$`,
      );
      if (!claim.eligible && claim.hasEntitlement && !claim.isWhitelisted) {
        parts.push("note: must verify identity before claiming");
      }
    }
  } else {
    parts.push("no wallet connected — cannot read personal balance/claim");
  }
  if (stats?.currentDay) parts.push(`current UBI day: ${stats.currentDay}`);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ChatResult {
  reply: string;
  toolsUsed: string[];
}

export async function runChat(
  messages: ChatMessage[],
  context: { wallet?: string },
): Promise<ChatResult> {
  const provider = getProvider();
  const client = await getMcpClient();

  return provider.useTools
    ? runWithTools(provider, client, messages, context)
    : runWithContext(provider, client, messages, context);
}

/** Local / small-model path: inject live facts, answer in a single pass. */
async function runWithContext(
  provider: Provider,
  client: Client,
  messages: ChatMessage[],
  context: { wallet?: string },
): Promise<ChatResult> {
  const facts = await buildFacts(client, context.wallet);
  const system = [
    basePrompt(context.wallet),
    "",
    "Live on-chain data (fetched just now):",
    facts,
  ].join("\n");

  const convo: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const completion = await provider.client.chat.completions.create({
    model: provider.model,
    messages: convo,
    max_tokens: MAX_TOKENS,
    temperature: 0.3,
  });

  return {
    reply: completion.choices[0]?.message?.content ?? "",
    toolsUsed: context.wallet
      ? [
          "gooddollar_get_daily_stats",
          "gooddollar_get_balance",
          "gooddollar_verify_status",
          "gooddollar_claim_eligibility",
        ]
      : ["gooddollar_get_daily_stats"],
  };
}

/** OpenAI path: let the model drive MCP tool calls. */
async function runWithTools(
  provider: Provider,
  client: Client,
  messages: ChatMessage[],
  context: { wallet?: string },
): Promise<ChatResult> {
  const { tools } = await client.listTools();
  const openaiTools: ChatCompletionTool[] = tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: (tool.inputSchema as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      },
    },
  }));

  const convo: ChatCompletionMessageParam[] = [
    { role: "system", content: basePrompt(context.wallet) },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const toolsUsed: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await provider.client.chat.completions.create({
      model: provider.model,
      messages: convo,
      tools: openaiTools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    if (!choice) return { reply: "Sorry, no response.", toolsUsed };
    convo.push(choice);

    const toolCalls = choice.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { reply: choice.content ?? "", toolsUsed };
    }

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") continue;
      const name = toolCall.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = toolCall.function.arguments
          ? JSON.parse(toolCall.function.arguments)
          : {};
      } catch {
        args = {};
      }
      if (context.wallet && args.wallet === undefined) {
        args.wallet = context.wallet;
      }
      toolsUsed.push(name);
      let text: string;
      try {
        text = await callTool(client, name, args);
      } catch (error) {
        text = JSON.stringify({
          error: "TOOL_FAILED",
          message: (error as Error).message,
        });
      }
      convo.push({ role: "tool", tool_call_id: toolCall.id, content: text });
    }
  }

  return {
    reply: "I gathered data but couldn't finish. Please rephrase.",
    toolsUsed,
  };
}
