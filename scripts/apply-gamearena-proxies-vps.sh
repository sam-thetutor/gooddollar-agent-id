#!/usr/bin/env bash
# Assign GAMEARENA_PROXY per agent from GAMEARENA_PROXY_POOL, patch skill + PM2, restart.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${REMOTE:-geinz-vps}"
GC="/home/geinz/gcopilot"
AGENTS_ROOT="/home/geinz/goodagent/agents"
SKILLS_REPO="https://github.com/sam-thetutor/goodagent-skills.git"
SKILL_CACHE="/home/geinz/goodagent/.skill-registry/goodagent-skills"

echo "==> sync gamearena-player skill (proxy support) on ${REMOTE}"
ssh "${REMOTE}" bash -s <<REMOTE
set -euo pipefail
GC="${GC}"
AGENTS_ROOT="${AGENTS_ROOT}"
SKILL_CACHE="${SKILL_CACHE}"
SKILLS_REPO="${SKILLS_REPO}"

if [ ! -f "\$GC/.env" ]; then
  echo "ERROR: \$GC/.env missing" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source <(grep -E '^GAMEARENA_PROXY_POOL=' "\$GC/.env" | sed 's/^/export /')
set +a

if [ -z "\${GAMEARENA_PROXY_POOL:-}" ]; then
  echo "ERROR: GAMEARENA_PROXY_POOL is empty in \$GC/.env" >&2
  echo "Add residential HTTP proxies (comma or newline separated), e.g.:" >&2
  echo '  GAMEARENA_PROXY_POOL=http://user:pass@host1:port,http://user:pass@host2:port' >&2
  exit 1
fi

if [ -d "\$SKILL_CACHE/.git" ]; then
  cd "\$SKILL_CACHE" && git fetch origin && git reset --hard origin/main
else
  mkdir -p "\$(dirname "\$SKILL_CACHE")"
  git clone --depth 1 "\$SKILLS_REPO" "\$SKILL_CACHE"
fi

node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const GC = process.env.GC || "/home/geinz/gcopilot";
const AGENTS_ROOT = process.env.AGENTS_ROOT || "/home/geinz/goodagent/agents";
const SKILL_CACHE = process.env.SKILL_CACHE || "/home/geinz/goodagent/.skill-registry/goodagent-skills";

function parsePool(raw) {
  return raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}

function pickProxy(deployId, pool) {
  let h = 0;
  for (let i = 0; i < deployId.length; i++) {
    h = (h * 31 + deployId.charCodeAt(i)) >>> 0;
  }
  return pool[h % pool.length];
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

const envFile = path.join(GC, ".env");
const poolRaw = fs.readFileSync(envFile, "utf8")
  .split("\n")
  .find((l) => l.startsWith("GAMEARENA_PROXY_POOL="))
  ?.slice("GAMEARENA_PROXY_POOL=".length)
  ?.replace(/^["']|["']$/g, "") ?? "";
const pool = parsePool(poolRaw);
if (pool.length === 0) {
  console.error("GAMEARENA_PROXY_POOL parsed to empty list");
  process.exit(1);
}
console.log(`[proxy] pool size ${pool.length}`);

const skillSrc = path.join(SKILL_CACHE, "skills/gamearena-player");
let count = 0;
for (const agentDir of fs.readdirSync(AGENTS_ROOT)) {
  const skillDir = path.join(AGENTS_ROOT, agentDir, "skills", "gamearena-player");
  if (!fs.existsSync(path.join(skillDir, "package.json"))) continue;

  const proxy = pickProxy(agentDir, pool);
  console.log(`[proxy] ${agentDir} -> ${mask(proxy)}`);

  fs.cpSync(skillSrc, skillDir, { recursive: true, force: true });

  const envPath = path.join(skillDir, ".env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  envContent = upsertEnvLine(envContent, "GAMEARENA_PROXY", proxy);
  fs.writeFileSync(envPath, envContent, { mode: 0o600 });

  const ecoPath = path.join(AGENTS_ROOT, agentDir, "ecosystem.config.cjs");
  if (fs.existsSync(ecoPath)) {
    const req = createRequire(ecoPath);
    delete req.cache[ecoPath];
    const eco = req(ecoPath);
    if (eco.apps?.[0]?.env) {
      eco.apps[0].env.GAMEARENA_PROXY = proxy;
      fs.writeFileSync(
        ecoPath,
        `module.exports = ${JSON.stringify(eco, null, 2)};\n`,
      );
    }
  }

  const { execSync } = require("node:child_process");
  execSync("npm ci", { cwd: skillDir, stdio: "inherit" });
  count += 1;
}
console.log(`[proxy] patched ${count} gamearena agents`);
NODE

GC="\$GC" AGENTS_ROOT="\$AGENTS_ROOT" SKILL_CACHE="\$SKILL_CACHE" node -e "process.exit(0)"

# Restart staggered
for eco in "\$AGENTS_ROOT"/*/ecosystem.config.cjs; do
  deploy_id=\$(basename "\$(dirname "\$eco")")
  if [ ! -d "\$AGENTS_ROOT/\$deploy_id/skills/gamearena-player" ]; then
    continue
  fi
  pm2_name="ga-\$deploy_id"
  if pm2 describe "\$pm2_name" >/dev/null 2>&1; then
    pm2 restart "\$pm2_name" --update-env
    echo "restarted \$pm2_name"
    sleep 5
  fi
done

echo "==> sample log (cmrkdwwn)"
tail -6 "\$AGENTS_ROOT/cmrkdwwn401swkq3udf8j1vqd/logs/out.log" 2>/dev/null || true
REMOTE

echo "==> done"
