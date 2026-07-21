#!/usr/bin/env bash
# Assign GAMEARENA_PROXY per agent, sync gamearena-player skill, restart PM2.
set -euo pipefail

REMOTE="${REMOTE:-geinz-vps}"

echo "==> apply GameArena proxies on ${REMOTE}"
ssh "${REMOTE}" 'bash -s' <<'REMOTE'
set -euo pipefail
GC="/home/geinz/gcopilot"
AGENTS_ROOT="/home/geinz/goodagent/agents"
SKILL_CACHE="/home/geinz/goodagent/.skill-registry/goodagent-skills"
SKILLS_REPO="https://github.com/sam-thetutor/goodagent-skills.git"

if [ ! -f "$GC/.env" ]; then
  echo "ERROR: $GC/.env missing" >&2
  exit 1
fi

has_pool=$(grep -c '^GAMEARENA_PROXY_POOL=' "$GC/.env" 2>/dev/null || true)
has_template=$(grep -c '^GAMEARENA_PROXY_TEMPLATE=' "$GC/.env" 2>/dev/null || true)
if [ "$has_pool" = 0 ] && [ "$has_template" = 0 ]; then
  echo "ERROR: set GAMEARENA_PROXY_TEMPLATE or GAMEARENA_PROXY_POOL in $GC/.env" >&2
  echo '  GAMEARENA_PROXY_TEMPLATE=http://user-session-{deployId}:pass@proxy.host:8080' >&2
  exit 1
fi

if [ -d "$SKILL_CACHE/.git" ]; then
  cd "$SKILL_CACHE" && git fetch origin && git reset --hard origin/main
else
  mkdir -p "$(dirname "$SKILL_CACHE")"
  git clone --depth 1 "$SKILLS_REPO" "$SKILL_CACHE"
fi

export GC AGENTS_ROOT SKILL_CACHE
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { execSync } = require("node:child_process");

const GC = process.env.GC;
const AGENTS_ROOT = process.env.AGENTS_ROOT;
const SKILL_CACHE = process.env.SKILL_CACHE;
const skillSrc = path.join(SKILL_CACHE, "skills/gamearena-player");

function readEnvFile(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0 || line.startsWith("#")) continue;
    const key = line.slice(0, i);
    let val = line.slice(i + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parsePool(raw) {
  return (raw || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}

function pickProxy(deployId, pool) {
  let h = 0;
  for (let i = 0; i < deployId.length; i++) {
    h = (h * 31 + deployId.charCodeAt(i)) >>> 0;
  }
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
  if (pool.length === 0) throw new Error("GAMEARENA_PROXY_POOL is empty");
  return pickProxy(deployId, pool);
}

function mask(url) {
  try {
    const u = new URL(url);
    if (u.username) u.username = "***";
    if (u.password) u.password = "***";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "[proxy]";
  }
}

function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
}

const hostEnv = readEnvFile(path.join(GC, ".env"));
let count = 0;

for (const agentDir of fs.readdirSync(AGENTS_ROOT)) {
  const skillDir = path.join(AGENTS_ROOT, agentDir, "skills", "gamearena-player");
  if (!fs.existsSync(path.join(skillDir, "package.json"))) continue;

  const proxy = resolveProxy(agentDir, hostEnv);
  console.log(`[proxy] ${agentDir} -> ${mask(proxy)}`);

  const statePath = path.join(skillDir, "state.json");
  const stateBackup = fs.existsSync(statePath) ? fs.readFileSync(statePath) : null;

  fs.cpSync(path.join(skillSrc, "src"), path.join(skillDir, "src"), { recursive: true });
  fs.copyFileSync(path.join(skillSrc, "package.json"), path.join(skillDir, "package.json"));
  const lock = path.join(skillSrc, "package-lock.json");
  if (fs.existsSync(lock)) {
    fs.copyFileSync(lock, path.join(skillDir, "package-lock.json"));
  }
  if (stateBackup) fs.writeFileSync(statePath, stateBackup);

  const envPath = path.join(skillDir, ".env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  envContent = upsertEnvLine(envContent, "GAMEARENA_PROXY", proxy);
  fs.writeFileSync(envPath, envContent, { mode: 0o600 });

  const ecoPath = path.join(AGENTS_ROOT, agentDir, "ecosystem.config.cjs");
  if (fs.existsSync(ecoPath)) {
    delete createRequire(ecoPath).cache?.[ecoPath];
    const req = createRequire(ecoPath);
    const eco = req(ecoPath);
    if (eco.apps?.[0]?.env) {
      eco.apps[0].env.GAMEARENA_PROXY = proxy;
      fs.writeFileSync(ecoPath, `module.exports = ${JSON.stringify(eco, null, 2)};\n`);
    }
  }

  execSync("npm ci", { cwd: skillDir, stdio: "inherit" });
  count += 1;
}
console.log(`[proxy] patched ${count} gamearena agents`);
NODE

for eco in "$AGENTS_ROOT"/*/ecosystem.config.cjs; do
  deploy_id=$(basename "$(dirname "$eco")")
  if [ ! -d "$AGENTS_ROOT/$deploy_id/skills/gamearena-player" ]; then
    continue
  fi
  pm2_name="ga-$deploy_id"
  if pm2 describe "$pm2_name" >/dev/null 2>&1; then
    pm2 restart "$pm2_name" --update-env
    echo "restarted $pm2_name"
    sleep 5
  fi
done
REMOTE

echo "==> done"
