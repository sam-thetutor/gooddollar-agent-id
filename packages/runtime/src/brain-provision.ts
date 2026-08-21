import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { agentDir } from "./wallet.js";

/**
 * Brain provisioning — generates persona, knowledge and brain-manifest.json
 * for a deploy and describes the PM2 companion process (`ga-brain-<id>`)
 * that runs @goodagent/agent-brain next to the skill/runtime process.
 *
 * Mirrors the hand-rolled ACTION-ORDER pilot setup on the VPS.
 */

export interface BrainDeploySettings {
  /** Inference model, e.g. "deepseek-v4-flash" or "<peerId>@<model>". */
  model?: string;
  /** Persona preset; defaults to the deploy template ("gaming" | "assistant"). */
  personaPreset?: string;
  /** Brain tool names; defaults to verify_address, check_claim_eligibility, agent_stats. */
  tools?: string[];
  /** Telegram bot token (decrypted). Required — telegram is the only channel today. */
  botToken: string;
}

export interface BrainProvisionInput {
  deployId: string;
  displayName: string;
  template: string;
  agentAddress: string;
  agentsRoot: string;
  apiBase: string;
  hostUrl: string;
  skills: Array<{ skillId: string; configuration?: Record<string, string> }>;
  settings: BrainDeploySettings;
}

export interface BrainProvisionResult {
  manifestPath: string;
  personaPath: string;
  cliPath: string;
  pm2Name: string;
  env: Record<string, string>;
  cwd: string;
  logDir: string;
}

export const DEFAULT_BRAIN_TOOLS = [
  "verify_address",
  "check_claim_eligibility",
  "agent_stats",
];

export function brainPm2Name(deployId: string): string {
  return `ga-brain-${deployId}`;
}

export function resolveAgentBrainCli(): string {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("@goodagent/agent-brain");
  const cli = resolve(dirname(entry), "cli.js");
  if (!existsSync(cli)) {
    throw new Error("@goodagent/agent-brain dist/cli.js not found — run pnpm build");
  }
  return cli;
}

/** Validate a Telegram bot token via getMe; returns the bot username. */
export async function validateTelegramBotToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`);
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: { username?: string };
    description?: string;
  } | null;
  if (!res.ok || !body?.ok || !body.result?.username) {
    throw new Error(
      `Telegram bot token rejected: ${body?.description ?? `HTTP ${res.status}`}`,
    );
  }
  return body.result.username;
}

const KNOWLEDGE_GOODDOLLAR_UBI = `GoodDollar (G$) is a digital universal basic income (UBI) protocol.

- Anyone can claim a small daily amount of G$ after completing GoodID face
  verification (proof of unique human).
- Claims happen on Celo via the UBIScheme contract; one claim per human per day.
  The claim day resets at 12:00 UTC.
- The claimable amount varies daily depending on the pool.
- Users claim at https://gooddapp.org — wallet apps: GoodWallet or GoodDapp.
- Face verification expires periodically and must be renewed in the GoodWallet
  or GoodDapp when prompted.
- G$ can be used for payments, savings pools, and (via the GoodDollar AntSeed
  integration) to buy AI compute credits.
`;

const KNOWLEDGE_SCAM_PATTERNS = `Common scam patterns in the GoodDollar community:

- "Support agents" DMing first and asking for a seed phrase or private key.
  Real support never asks for these.
- Fake claim sites that imitate GoodWallet/GoodDapp and ask users to "validate"
  a wallet by sending G$ or CELO first. Claiming never requires sending funds.
- "Double your G$" giveaway addresses. No legitimate program doubles deposits.
- Impersonation bots with names similar to official bots. Users can check
  whether an agent address is human-backed with the verify tool; unverified
  agents should not be trusted with funds.
- Urgency pressure ("your wallet will be suspended today"). Legitimate
  processes never threaten immediate loss of funds.
`;

export const PRODUCTCLANK_SKILL_ID = "work/social/productclank_participant";
const PRODUCTCLANK_SKILL_FOLDER = "productclank-participant";
const AMPLIFY_TOOLS = [
  "amplify_pending",
  "amplify_mark_posted",
  "amplify_feed",
  "amplify_campaigns",
  "amplify_campaign_drafts",
  "amplify_earnings",
  "amplify_account",
  "amplify_products_search",
  "amplify_boost_preview",
  "amplify_boost_post",
  "amplify_my_campaigns",
  "amplify_campaign_detail",
  "amplify_campaign_posts",
  "amplify_products_list",
  "amplify_discover_preview",
  "amplify_discover_create",
  "amplify_discover_research",
  "amplify_discover_generate_preview",
  "amplify_discover_generate",
  "amplify_content_preview",
  "amplify_content_launch",
  "amplify_credits_history",
  "amplify_campaign_delegate",
  "amplify_discover_regenerate_preview",
  "amplify_discover_regenerate",
  "amplify_discover_review_preview",
  "amplify_discover_review",
];

/** Tools that call the ProductClank API — omitted from the manifest until PRODUCTCLANK_API_KEY is set. */
const AMPLIFY_TOOLS_REQUIRING_API_KEY = new Set([
  "amplify_feed",
  "amplify_earnings",
  "amplify_account",
  "amplify_products_search",
  "amplify_boost_preview",
  "amplify_boost_post",
  "amplify_my_campaigns",
  "amplify_campaign_detail",
  "amplify_campaign_posts",
  "amplify_products_list",
  "amplify_discover_preview",
  "amplify_discover_create",
  "amplify_discover_research",
  "amplify_discover_generate_preview",
  "amplify_discover_generate",
  "amplify_content_preview",
  "amplify_content_launch",
  "amplify_credits_history",
  "amplify_campaign_delegate",
  "amplify_discover_regenerate_preview",
  "amplify_discover_regenerate",
  "amplify_discover_review_preview",
  "amplify_discover_review",
]);

/** Human-readable one-liners for known skills (persona context). */
const SKILL_DESCRIPTIONS: Record<string, string> = {
  "gaming/wagering/gamearena_1v1":
    "GameArena 1v1 — rock-paper-scissors versus other agents with small G$ wagers, " +
    "a daily match cap and a daily loss cap so you can never overspend.",
  "gaming/card-fighter/actionorder_vshouse":
    "ActionOrder vs-house — autonomous card-battle matches against the house.",
  "community/reminders/gooddollar_claim":
    "GoodDollar claim reminders — watches subscribed wallets and notifies when UBI is claimable.",
  [PRODUCTCLANK_SKILL_ID]:
    "ProductClank Amplify — earns by participating in campaigns (reply drafts, submit, $PRO) " +
    "and can launch Boost, Discover, and Content campaigns billed to the linked owner's ProductClank credits.",
};

function describeSkills(
  skills: Array<{ skillId: string }>,
): string {
  if (!skills.length) return "- (no skills installed yet)";
  return skills
    .map((s) => `- ${SKILL_DESCRIPTIONS[s.skillId] ?? `Runs the "${s.skillId}" skill autonomously.`}`)
    .join("\n");
}

const SHARED_RULES = `## Behaviour

- Never introduce yourself as the underlying AI model. If asked what powers
  you, say you run on decentralized AntSeed inference paid in GoodDollars.
- Plain text only: no markdown like **bold** or # headings and no HTML tags —
  Telegram shows them as literal characters. Dashes for lists are fine.
- Reply in English by default. Only switch language when the user writes a
  full sentence clearly in another language — a greeting alone is not enough.
- Be concise and friendly. Telegram messages should be short — a few sentences.
- When a user shares a wallet or agent address, use verify_address before
  making any claim about whether it can be trusted.
- When a user asks about claiming GoodDollar UBI, use check_claim_eligibility
  with their wallet address.
- Never ask for private keys or seed phrases. If a user offers them, tell them
  to never share those with anyone — including you. If someone asked them for
  one, warn them it is a scam.

## Limits

- You cannot send transactions, move funds, place bets for users, or change
  your own configuration from chat. Chat is read-only company; your skills run
  in a separate process.
- If someone asks you to pause, stop, resume, or restart the agent, tell them
  to send the exact command /pause, /resume, or /status. Those commands are
  handled outside of you and only work for the linked operator (linked from
  the agent dashboard). You cannot start or stop anything yourself.
- If you are unsure, say so instead of guessing.
`;

export function buildBrainPersona(input: {
  displayName: string;
  agentAddress: string;
  template: string;
  personaPreset?: string;
  skills: Array<{ skillId: string }>;
  tools: string[];
}): string {
  const preset = input.personaPreset ?? input.template;
  const statsRule = input.tools.includes("agent_stats")
    ? "- When asked about your match record, stats, today's games, wins/losses, or\n" +
      "  how you are doing, call agent_stats for live numbers instead of guessing.\n"
    : "";
  const amplifyRule = input.tools.includes("amplify_pending")
    ? "- You earn on ProductClank Amplify with a human-in-the-loop: call\n" +
      "  amplify_pending when the operator asks what there is to post, show each\n" +
      "  draft's exact text, target post URL and platform, and when the operator\n" +
      "  sends back the URL of a posted reply, record it with amplify_mark_posted.\n" +
      "- amplify_pending shows only the small local approval queue. When the\n" +
      "  operator asks what is available for a platform (Twitter, TikTok, …) or\n" +
      "  what else is out there, call amplify_feed with that platform filter.\n" +
      "- When the operator asks which campaigns exist or what they can join, call\n" +
      "  amplify_campaigns (optionally with platform or keyword). Always include\n" +
      "  each campaign's targetPosts links (the live posts on Twitter/TikTok/etc.)\n" +
      "  when present — never link to ProductClank pages, the operator wants the\n" +
      "  actual posts. There is no separate join step — posting a draft for a\n" +
      "  campaign is participating.\n" +
      "- When the operator asks for drafts or what to post for ONE specific\n" +
      "  campaign (by name, CP id, or keyword), call amplify_campaign_drafts with\n" +
      "  that campaign — it merges the local queue and live ProductClank feed.\n" +
      "- When asked about Amplify earnings, points, credits, strikes or $PRO,\n" +
      "  call amplify_earnings for live numbers instead of guessing.\n" +
      "- Campaign creation (Boost) bills the linked owner's ProductClank credits — never\n" +
      "  the agent's wallet. Before any spend, call amplify_account to confirm the owner\n" +
      "  linked their ProductClank account. For Boost: amplify_boost_preview → confirm cost\n" +
      "  with the operator → amplify_boost_post with confirmed=true. Search products with\n" +
      "  amplify_products_search; list new ones with amplify_products_list (confirmed=true).\n" +
      "- Discover campaigns (find Twitter conversations): amplify_discover_preview →\n" +
      "  amplify_discover_create (10 credits) → amplify_discover_research (free) →\n" +
      "  amplify_discover_generate_preview → amplify_discover_generate (~12 credits/post).\n" +
      "  Manage with amplify_my_campaigns, amplify_campaign_detail, amplify_campaign_posts;\n" +
      "  regenerate replies (5/post) or review relevancy (2/post) via the discover_regenerate/review tools.\n" +
      "- Content campaigns (UGC briefs): amplify_content_preview → amplify_content_launch (1000 credits).\n" +
      "  Submissions and winners are handled in the ProductClank web app.\n" +
      "- amplify_credits_history shows owner credit spend. amplify_campaign_delegate adds a web-app co-manager.\n" +
      "  Never purchase credits for the agent — the operator tops up their ProductClank account.\n"
    : "";
  const toolRules = statsRule + amplifyRule;

  if (preset === "gaming") {
    return `# ${input.displayName}

You are ${input.displayName}, a human-backed, GoodAgent-verified gaming agent
on the GoodDollar network (agent wallet ${input.agentAddress}).

## What you do

You play games autonomously, around the clock, with small G$ wagers:

${describeSkills(input.skills)}

Your matches, wagers and results are all public on-chain activity. A verified
human operator stands behind you with a refundable G$ bond.

${toolRules}${SHARED_RULES}
- Be a little competitive — you are a gamer, after all.
- Explain what you play, your loss limits, and how GoodAgent verification
  works when asked.
`;
  }

  return `# ${input.displayName}

You are ${input.displayName}, a human-backed, GoodAgent-verified assistant
on the GoodDollar network (agent wallet ${input.agentAddress}).

## What you do

${describeSkills(input.skills)}

A verified human operator stands behind you with a refundable G$ bond.

${toolRules}${SHARED_RULES}`;
}

/**
 * Write brain/persona.md, brain/knowledge/*.md and brain-manifest.json into
 * the agent dir, and return the PM2 companion process description.
 */
export function provisionBrain(input: BrainProvisionInput): BrainProvisionResult {
  const dir = agentDir(input.agentsRoot, input.deployId);
  const brainDir = resolve(dir, "brain");
  const knowledgeDir = resolve(brainDir, "knowledge");
  mkdirSync(knowledgeDir, { recursive: true });
  mkdirSync(resolve(dir, "logs"), { recursive: true });

  const hasProductClankSkill = input.skills.some(
    (s) => s.skillId === PRODUCTCLANK_SKILL_ID,
  );
  const productClankApiKey = hasProductClankSkill
    ? input.skills
        .find((s) => s.skillId === PRODUCTCLANK_SKILL_ID)
        ?.configuration?.PRODUCTCLANK_API_KEY?.trim() || undefined
    : undefined;
  const baseTools = input.settings.tools?.length
    ? input.settings.tools
    : DEFAULT_BRAIN_TOOLS;
  // amplify_feed/amplify_earnings need the API key at runtime — enabling them
  // without one would crash the brain at startup.
  const amplifyTools = AMPLIFY_TOOLS.filter(
    (t) => productClankApiKey || !AMPLIFY_TOOLS_REQUIRING_API_KEY.has(t),
  );
  const tools = hasProductClankSkill
    ? [...baseTools, ...amplifyTools.filter((t) => !baseTools.includes(t))]
    : baseTools;

  const personaPath = resolve(brainDir, "persona.md");
  writeFileSync(
    personaPath,
    buildBrainPersona({
      displayName: input.displayName,
      agentAddress: input.agentAddress,
      template: input.template,
      personaPreset: input.settings.personaPreset,
      skills: input.skills,
      tools,
    }),
    "utf8",
  );
  writeFileSync(
    resolve(knowledgeDir, "gooddollar-ubi.md"),
    KNOWLEDGE_GOODDOLLAR_UBI,
    "utf8",
  );
  writeFileSync(
    resolve(knowledgeDir, "scam-patterns.md"),
    KNOWLEDGE_SCAM_PATTERNS,
    "utf8",
  );

  const manifestPath = resolve(dir, "brain-manifest.json");
  const manifest = {
    deployId: input.deployId,
    displayName: input.displayName,
    brain: {
      ...(input.settings.model ? { model: input.settings.model } : {}),
      channels: ["telegram"],
      persona: "brain/persona.md",
      knowledge: [
        "brain/knowledge/gooddollar-ubi.md",
        "brain/knowledge/scam-patterns.md",
      ],
      tools,
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const env: Record<string, string> = {
    NODE_ENV: "production",
    BRAIN_LLM_BASE_URL:
      process.env.BRAIN_LLM_BASE_URL?.trim() || "http://localhost:8377/v1",
    GOODAGENT_HOST_URL: input.hostUrl.replace(/\/$/, ""),
    BRAIN_MEMORY_DIR: resolve(dir, "brain-memory"),
    API_BASE: input.apiBase,
    TELEGRAM_BOT_TOKEN: input.settings.botToken,
  };
  if (hasProductClankSkill) {
    env.AMPLIFY_QUEUE_FILE = resolve(
      dir,
      "skills",
      PRODUCTCLANK_SKILL_FOLDER,
      "amplify-queue.json",
    );
    // amplify_feed / amplify_earnings talk to the ProductClank API directly.
    if (productClankApiKey) env.PRODUCTCLANK_API_KEY = productClankApiKey;
  }
  if (process.env.BRAIN_LLM_API_KEY?.trim()) {
    env.BRAIN_LLM_API_KEY = process.env.BRAIN_LLM_API_KEY.trim();
  }
  // Enables Telegram control commands (/pause, /resume, /status): the brain
  // calls host internal endpoints with this shared secret.
  if (process.env.HOST_INTERNAL_SECRET?.trim()) {
    env.HOST_INTERNAL_SECRET = process.env.HOST_INTERNAL_SECRET.trim();
  }
  if (!input.settings.model && process.env.BRAIN_DEFAULT_MODEL?.trim()) {
    env.BRAIN_MODEL = process.env.BRAIN_DEFAULT_MODEL.trim();
  }

  return {
    manifestPath,
    personaPath,
    cliPath: resolveAgentBrainCli(),
    pm2Name: brainPm2Name(input.deployId),
    env,
    cwd: dir,
    logDir: resolve(dir, "logs"),
  };
}
