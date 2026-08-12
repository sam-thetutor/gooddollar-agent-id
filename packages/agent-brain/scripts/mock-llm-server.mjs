// Deterministic OpenAI-compatible mock server for testing the brain loop
// without real inference. Emits tool calls for messages containing addresses,
// then summarizes tool results. Run: node scripts/mock-llm-server.mjs [port]
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 8378);
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;

function decide(messages) {
  const last = messages[messages.length - 1];

  if (last.role === "tool") {
    const result = JSON.parse(last.content);
    let text;
    if ("eligible" in result) {
      text = result.eligible
        ? `Yes — that wallet can claim ${result.claimAmountFormatted} G$ today.`
        : `No — that wallet cannot claim right now (whitelisted: ${result.isWhitelisted}, entitlement: ${result.hasEntitlement}).`;
    } else if ("valid" in result) {
      text = result.valid
        ? `That address IS a verified human-backed GoodAgent (operator ${result.operator ?? "unknown"}). Reasonably safe to interact with.`
        : `Warning: that address is NOT a verified GoodAgent (reason: ${result.reason}). Be careful before sending funds.`;
    } else {
      text = `Tool result: ${last.content}`;
    }
    return { content: text };
  }

  const userText = last.content ?? "";
  const address = userText.match(ADDRESS_RE)?.[0];
  if (address && /claim|ubi/i.test(userText)) {
    return {
      tool_calls: [
        {
          id: "call_claim",
          type: "function",
          function: {
            name: "check_claim_eligibility",
            arguments: JSON.stringify({ wallet: address }),
          },
        },
      ],
    };
  }
  if (address) {
    return {
      tool_calls: [
        {
          id: "call_verify",
          type: "function",
          function: {
            name: "verify_address",
            arguments: JSON.stringify({ address }),
          },
        },
      ],
    };
  }
  return { content: "Hello! Share an address and I can verify it or check UBI claim eligibility." };
}

createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.includes("/chat/completions")) {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const { messages } = JSON.parse(body);
    const decision = decide(messages);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "mock",
        choices: [
          {
            message: {
              role: "assistant",
              content: decision.content ?? null,
              tool_calls: decision.tool_calls,
            },
          },
        ],
      }),
    );
  });
}).listen(port, () => console.log(`[mock-llm] listening on :${port}`));
