#!/usr/bin/env bash
# Sync live-arena skill (1s round pace, arena_match reporting) + host/web to VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${REMOTE:-geinz-vps}"
SKILL_LOCAL="${SKILL_LOCAL:-${ROOT}/../goodagent-skills/skills/gamearena-player}"
SKILL_REMOTE="/home/geinz/goodagent/.skill-registry/goodagent-skills/skills/gamearena-player"
ROUND_PACE_MS="${ROUND_PACE_MS:-1000}"

if [[ ! -d "$SKILL_LOCAL/src" ]]; then
  echo "ERROR: gamearena-player not found at $SKILL_LOCAL" >&2
  exit 1
fi

echo "==> rsync gamearena-player skill (local → VPS cache)"
ssh "${REMOTE}" "mkdir -p $(dirname "$SKILL_REMOTE")"
rsync -az --delete \
  --exclude node_modules \
  "${SKILL_LOCAL}/" "${REMOTE}:${SKILL_REMOTE}/"

echo "==> deploy host + runtime (SSE status fields, ROUND_PACE in skill-env)"
"${ROOT}/scripts/deploy-host-vps.sh"

echo "==> patch all gamearena agents on VPS (skill copy, ROUND_PACE_MS, restart PM2)"
ssh "${REMOTE}" bash -s <<REMOTE
set -euo pipefail
GC="/home/geinz/gcopilot"
AGENTS_ROOT="/home/geinz/goodagent/agents"
SKILL_CACHE="/home/geinz/goodagent/.skill-registry/goodagent-skills"
skillSrc="\${SKILL_CACHE}/skills/gamearena-player"
ROUND_PACE_MS="${ROUND_PACE_MS}"

node <<NODE
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { execSync } = require("node:child_process");

const AGENTS_ROOT = process.env.AGENTS_ROOT || "${AGENTS_ROOT}";
const skillSrc = "${SKILL_REMOTE}";
const roundPace = "${ROUND_PACE_MS}";

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\\n")) {
    const i = line.indexOf("=");
    if (i <= 0 || line.startsWith("#")) continue;
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

function parsePool(raw) {
  return (raw || "").split(/[\\n,]+/).map((s) => s.trim()).filter(Boolean);
}

function pickProxy(deployId, pool) {
  let h = 0;
  for (let i = 0; i < deployId.length; i++) h = (h * 31 + deployId.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

function resolveProxy(deployId, env) {
  if (env.GAMEARENA_PROXY?.trim()) return env.GAMEARENA_PROXY.trim();
  const template = env.GAMEARENA_PROXY_TEMPLATE?.trim();
  if (template) {
    return template.includes("{deployId}")
      ? template.replaceAll("{deployId}", deployId)
      : template;
  }
  const pool = parsePool(env.GAMEARENA_PROXY_POOL);
  if (pool.length) return pickProxy(deployId, pool);
  return "";
}

function upsertEnvLine(content, key, value) {
  const line = \`\${key}=\${value}\`;
  const re = new RegExp(\`^\${key}=.*$\`, "m");
  return re.test(content) ? content.replace(re, line) : \`\${content.trimEnd()}\\n\${line}\\n\`;
}

const hostEnv = readEnvFile("${GC}/.env");
let n = 0;

for (const agentDir of fs.readdirSync(AGENTS_ROOT)) {
  const skillDir = path.join(AGENTS_ROOT, agentDir, "skills", "gamearena-player");
  if (!fs.existsSync(path.join(skillDir, "package.json"))) continue;

  const proxy = resolveProxy(agentDir, hostEnv);
  const statePath = path.join(skillDir, "state.json");
  const stateBackup = fs.existsSync(statePath) ? fs.readFileSync(statePath) : null;

  fs.cpSync(path.join(skillSrc, "src"), path.join(skillDir, "src"), { recursive: true });
  fs.copyFileSync(path.join(skillSrc, "package.json"), path.join(skillDir, "package.json"));
  const lock = path.join(skillSrc, "package-lock.json");
  if (fs.existsSync(lock)) fs.copyFileSync(lock, path.join(skillDir, "package-lock.json"));
  if (stateBackup) fs.writeFileSync(statePath, stateBackup);

  const discoveryPath = path.join(skillDir, "gamearena-discovery.json");
  if (fs.existsSync(discoveryPath)) fs.unlinkSync(discoveryPath);

  let envContent = fs.existsSync(path.join(skillDir, ".env"))
    ? fs.readFileSync(path.join(skillDir, ".env"), "utf8")
    : "";
  if (proxy) envContent = upsertEnvLine(envContent, "GAMEARENA_PROXY", proxy);
  envContent = upsertEnvLine(envContent, "ROUND_PACE_MS", roundPace);
  envContent = upsertEnvLine(envContent, "GOODAGENT_HOST_URL", "http://127.0.0.1:3010");
  envContent = upsertEnvLine(envContent, "DEPLOY_ID", agentDir);
  const secret = hostEnv.HOST_INTERNAL_SECRET?.trim();
  if (secret) envContent = upsertEnvLine(envContent, "HOST_INTERNAL_SECRET", secret);
  const agentApiKey = hostEnv.GAMEARENA_AGENT_API_KEY?.trim();
  if (agentApiKey) {
    envContent = upsertEnvLine(envContent, "GAMEARENA_AGENT_API_KEY", agentApiKey);
    const agentApiUrl =
      hostEnv.GAMEARENA_AGENT_API_URL?.trim() ||
      "https://game-backend-production-6130.up.railway.app";
    envContent = upsertEnvLine(envContent, "GAMEARENA_AGENT_API_URL", agentApiUrl);
  }
  fs.writeFileSync(path.join(skillDir, ".env"), envContent, { mode: 0o600 });

  const ecoPath = path.join(AGENTS_ROOT, agentDir, "ecosystem.config.cjs");
  if (fs.existsSync(ecoPath)) {
    const req = createRequire(ecoPath);
    delete req.cache?.[ecoPath];
    const eco = req(ecoPath);
    if (eco.apps?.[0]?.env) {
      if (proxy) eco.apps[0].env.GAMEARENA_PROXY = proxy;
      eco.apps[0].env.ROUND_PACE_MS = roundPace;
      fs.writeFileSync(ecoPath, \`module.exports = \${JSON.stringify(eco, null, 2)};\\n\`);
    }
  }

  execSync("npm ci", { cwd: skillDir, stdio: "inherit" });
  console.log(\`[sync] \${agentDir} ROUND_PACE_MS=\${roundPace}\${proxy ? " proxy=set" : ""}\${agentApiKey ? " agent-api=set" : ""}\`);
  n++;
}
console.log(\`[sync] updated \${n} gamearena agent(s)\`);
NODE

for eco in "\$AGENTS_ROOT"/*/ecosystem.config.cjs; do
  deploy_id=\$(basename "\$(dirname "\$eco")")
  if [ ! -d "\$AGENTS_ROOT/\$deploy_id/skills/gamearena-player" ]; then
    continue
  fi
  pm2_name="ga-\$deploy_id"
  if pm2 describe "\$pm2_name" >/dev/null 2>&1; then
    pm2 restart "\$pm2_name" --update-env
    echo "restarted \$pm2_name"
    sleep 3
  fi
done
REMOTE

echo "==> deploy web (SSE live arena UI)"
"${ROOT}/scripts/deploy-web-vps.sh"

echo ""
echo "Done. Test live feed:"
echo "  https://goodagentids.xyz/dashboard/<deploy-id>"
echo "  Or localhost:5173 with VITE_HOST_USE_LOCAL=1 while agent plays"
echo "  Manual SSE: ?sseMatchId=am_... on dashboard URL during a match"
