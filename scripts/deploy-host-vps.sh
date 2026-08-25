#!/usr/bin/env bash
# Sync autonomous-deploy code to geinz-vps and (re)start goodagent-host.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="geinz-vps"
REMOTE_ROOT="/home/geinz/gcopilot"
HOST_PORT="${HOST_PORT:-3010}"

echo "==> rsync monorepo slices to ${REMOTE}:${REMOTE_ROOT}"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .turbo \
  "${ROOT}/apps/host/" "${REMOTE}:${REMOTE_ROOT}/apps/host/"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .turbo \
  "${ROOT}/packages/runtime/" "${REMOTE}:${REMOTE_ROOT}/packages/runtime/"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .turbo \
  "${ROOT}/packages/skill-sdk/" "${REMOTE}:${REMOTE_ROOT}/packages/skill-sdk/"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .turbo \
  "${ROOT}/packages/agent-runtime/" "${REMOTE}:${REMOTE_ROOT}/packages/agent-runtime/"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .turbo \
  "${ROOT}/packages/agent-brain/" "${REMOTE}:${REMOTE_ROOT}/packages/agent-brain/"
rsync -az \
  "${ROOT}/packages/db/prisma/" "${REMOTE}:${REMOTE_ROOT}/packages/db/prisma/"
rsync -az \
  "${ROOT}/packages/db/src/" "${REMOTE}:${REMOTE_ROOT}/packages/db/src/"
rsync -az \
  "${ROOT}/packages/db/package.json" \
  "${ROOT}/packages/db/tsconfig.json" \
  "${REMOTE}:${REMOTE_ROOT}/packages/db/"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  "${ROOT}/packages/shared/" "${REMOTE}:${REMOTE_ROOT}/packages/shared/"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  "${ROOT}/packages/live-arena/" "${REMOTE}:${REMOTE_ROOT}/packages/live-arena/"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  "${ROOT}/packages/agent-id/" "${REMOTE}:${REMOTE_ROOT}/packages/agent-id/"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  "${ROOT}/packages/chain/" "${REMOTE}:${REMOTE_ROOT}/packages/chain/"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  "${ROOT}/packages/shared/" "${REMOTE}:${REMOTE_ROOT}/packages/shared/"
rsync -az \
  "${ROOT}/package.json" \
  "${ROOT}/pnpm-lock.yaml" \
  "${ROOT}/pnpm-workspace.yaml" \
  "${ROOT}/tsconfig.base.json" \
  "${ROOT}/turbo.json" \
  "${REMOTE}:${REMOTE_ROOT}/"

echo "==> merge deploy env block on VPS"
ssh "${REMOTE}" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
GC="/home/geinz/gcopilot"
LOCAL_ENV="/Users/samthetutor/My-Work/Samuel/fff/.env"
REMOTE_ENV="$GC/.env"
AGENTS_ROOT="/home/geinz/goodagent/agents"
mkdir -p "$AGENTS_ROOT"

# Keys to copy from developer .env (never echoed)
KEYS=(
  DEPLOY_MNEMONIC
  PRIVATE_KEY
  OPERATOR_PRIVATE_KEY
  ENCRYPTION_SECRET
  HOST_INTERNAL_SECRET
  AGENT_INITIAL_GS
  AGENT_INITIAL_CELO
)

append_or_replace() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

MARKER="# --- Autonomous agent deploy ---"
if ! grep -q "$MARKER" "$REMOTE_ENV" 2>/dev/null; then
  echo "" >> "$REMOTE_ENV"
  echo "$MARKER" >> "$REMOTE_ENV"
fi

append_or_replace AGENTS_ROOT "$AGENTS_ROOT" "$REMOTE_ENV"
append_or_replace API_BASE "https://goodagentids.xyz/api" "$REMOTE_ENV"
append_or_replace HOST_VERIFY_API_BASE "http://127.0.0.1:3009" "$REMOTE_ENV"
append_or_replace HOST_PORT "3010" "$REMOTE_ENV"
append_or_replace HOST_DEV_SKIP_PAYMENT "1" "$REMOTE_ENV"
append_or_replace AGENT_INITIAL_GS "200" "$REMOTE_ENV"
append_or_replace AGENT_INITIAL_CELO "0.5" "$REMOTE_ENV"
append_or_replace RUNTIME_V1 "1" "$REMOTE_ENV"
append_or_replace ACTIONORDER_URL "https://www.actionorder.xyz" "$REMOTE_ENV"
# LLM brain: local AntSeed buyer proxy + default paid peer/model (G$-funded).
append_or_replace BRAIN_LLM_BASE_URL "http://localhost:8377/v1" "$REMOTE_ENV"
append_or_replace BRAIN_DEFAULT_MODEL "9e8f9aaee684298b7f2af2ae008e3692f0e9f4f7@deepseek-v4-flash" "$REMOTE_ENV"
# Kasuku catalog on the same VPS (kasuku-web :3015). Secret is set on the VPS only — do not copy local.
append_or_replace KASUKU_CATALOG_URL "http://127.0.0.1:3015" "$REMOTE_ENV"
# Optional — set in local .env to sync partner + agent keys to VPS
# ACTIONORDER_PARTNER_API_KEY / ACTIONORDER_AGENT_API_KEY copied below if present
# Postgres runs on the same VPS — localhost avoids flaky public-IP connections
if grep -q '@80.241.209.225:5432' "$REMOTE_ENV" 2>/dev/null; then
  sed -i 's|@80.241.209.225:5432|@127.0.0.1:6543|g' "$REMOTE_ENV"
fi
# Supabase Supavisor: port 5432 is session mode (pool_size=5); use 6543 transaction pool.
if grep -q '@127.0.0.1:5432/postgres?schema=gcopilot' "$REMOTE_ENV" 2>/dev/null; then
  sed -i 's|@127.0.0.1:5432/postgres?schema=gcopilot|@127.0.0.1:6543/postgres?pgbouncer=true\&schema=gcopilot|' "$REMOTE_ENV"
fi
REMOTE_SCRIPT

# Copy secret values from local .env
while IFS= read -r key; do
  val="$(grep "^${key}=" "${ROOT}/.env" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')"
  if [[ -z "${val}" ]]; then
    echo "WARN: ${key} missing in local .env"
    continue
  fi
  # Escape for remote sed; mnemonic must stay quoted (dotenv reads only first word otherwise).
  if [[ "${key}" == "DEPLOY_MNEMONIC" ]]; then
    esc_val="\"$(printf '%s' "$val" | sed 's/"/\\"/g')\""
  else
    esc_val="$(printf '%s' "$val" | sed 's/[&/\]/\\&/g')"
  fi
  ssh "${REMOTE}" "grep -q '^${key}=' /home/geinz/gcopilot/.env && sed -i 's|^${key}=.*|${key}=${esc_val}|' /home/geinz/gcopilot/.env || echo '${key}=${esc_val}' >> /home/geinz/gcopilot/.env"
done <<'KEYS'
DEPLOY_MNEMONIC
PRIVATE_KEY
OPERATOR_PRIVATE_KEY
ENCRYPTION_SECRET
HOST_INTERNAL_SECRET
AGENT_INITIAL_GS
AGENT_INITIAL_CELO
ACTIONORDER_PARTNER_API_KEY
ACTIONORDER_AGENT_API_KEY
KEYS

echo "==> install, db push, build on VPS"
ssh "${REMOTE}" bash -s <<REMOTE_BUILD
set -euo pipefail
export PATH="\$HOME/.local/share/pnpm:\$HOME/.npm-global/bin:\$PATH"
cd /home/geinz/gcopilot
command -v pnpm >/dev/null || npm i -g pnpm@9.15.0
pnpm install --filter @goodagent/host... --filter @goodagent/runtime... --filter @goodagent/agent-runtime... --filter @goodagent/agent-brain... --filter @goodagent/skill-sdk... --filter @goodagent/db... --filter @goodagent/shared... --filter @goodagent/live-arena... --filter @goodagent/chain...
# Prisma db push needs session pool (5432), not transaction pool (6543/pgbouncer).
# Transaction pool hangs indefinitely on DDL; schema is usually already in sync.
SESSION_DB_URL="\$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's|6543/postgres?pgbouncer=true&|5432/postgres?|')"
if timeout 120 env DATABASE_URL="\$SESSION_DB_URL" pnpm --filter @goodagent/db exec prisma db push --accept-data-loss --skip-generate; then
  echo "db push ok (session pool 5432)"
else
  echo "WARN: db push skipped or timed out — continuing build (runtime uses 6543 pool)"
fi
pnpm --filter @goodagent/shared build
pnpm --filter @goodagent/skill-sdk build
pnpm --filter @goodagent/live-arena build
pnpm --filter @goodagent/db build
pnpm --filter @goodagent/chain build
pnpm --filter @goodagent/agent-runtime build
pnpm --filter @goodagent/agent-brain build
pnpm --filter @goodagent/runtime build
pnpm --filter @goodagent/host build
command -v git >/dev/null || (echo "git required for skill clone" && exit 1)
mkdir -p /home/geinz/goodagent/agents
REMOTE_BUILD

echo "==> pm2 (re)start goodagent-host"
ssh "${REMOTE}" bash -s <<REMOTE_PM2
set -euo pipefail
cd /home/geinz/gcopilot/apps/host
if pm2 describe goodagent-host >/dev/null 2>&1; then
  pm2 delete goodagent-host || true
fi
# App loads /home/geinz/gcopilot/.env via dotenv — do not \`source\` it (mnemonic breaks bash).
pm2 start dist/index.js --name goodagent-host --cwd /home/geinz/gcopilot/apps/host
pm2 save
sleep 3
curl -sf "http://127.0.0.1:3010/health"
REMOTE_PM2

echo "==> VPS host healthy on port ${HOST_PORT}"
