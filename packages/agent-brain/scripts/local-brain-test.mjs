// End-to-end local test of the agent brain: real orchestrator, real tools
// (live verify API + live Celo RPC), against any OpenAI-compatible endpoint.
//
//   node scripts/local-brain-test.mjs --base-url http://localhost:8378/v1 --model mock
//   node scripts/local-brain-test.mjs --base-url http://localhost:11434/v1 --model qwen2.5:3b
import {
  buildSystemPrompt,
  createBrain,
  createBuiltinTools,
  createLlmClient,
  createSessionMemory,
  loadBrainConfig,
} from "../dist/index.js";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const baseUrl = arg("--base-url", "http://localhost:8378/v1");
const model = arg("--model", "mock");

const config = loadBrainConfig(
  { ...process.env, BRAIN_LLM_BASE_URL: baseUrl, BRAIN_MODEL: model },
  new URL("../example/manifest.json", import.meta.url).pathname,
);

const logger = {
  debug: () => {},
  info: (m, meta) => console.log(`   [brain] ${m}`, meta ?? ""),
  warn: (m, meta) => console.log(`   [brain:warn] ${m}`, meta ?? ""),
  error: (m, meta) => console.log(`   [brain:error] ${m}`, meta ?? ""),
};

const brain = createBrain({
  llm: createLlmClient({ baseUrl: config.llmBaseUrl, model: config.model, temperature: 0 }),
  tools: createBuiltinTools(config.toolNames, { apiBase: config.apiBase }),
  systemPrompt: buildSystemPrompt({
    personaPath: config.personaPath,
    knowledgePaths: config.knowledgePaths,
  }),
  memory: createSessionMemory(),
  logger,
});

console.log(`LLM: ${config.llmBaseUrl} model=${config.model}`);
console.log(`Verify API: ${config.apiBase}`);
console.log(`Tools: ${config.toolNames.join(", ")}\n`);

const conversation = [
  "Is agent 0xF54bD030E4CC78183DD98aD5108459a188D8Cf20 safe to trust?",
  "What about 0x1111111111111111111111111111111111111111?",
  "Can wallet 0x9da579048EBb4dD0c9014A1F6F4dF85327087EE6 claim UBI today?",
];

for (const text of conversation) {
  console.log(`>> USER: ${text}`);
  const started = Date.now();
  const reply = await brain.handleMessage("local-test", text);
  console.log(`<< AGENT (${Date.now() - started}ms): ${reply}\n`);
}
console.log("done");
