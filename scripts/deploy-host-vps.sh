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
append_or_replace HOST_PORT "3010" "$REMOTE_ENV"
append_or_replace HOST_DEV_SKIP_PAYMENT "1" "$REMOTE_ENV"
append_or_replace AGENT_INITIAL_GS "200" "$REMOTE_ENV"
append_or_replace AGENT_INITIAL_CELO "1" "$REMOTE_ENV"
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
KEYS

echo "==> install, db push, build on VPS"
ssh "${REMOTE}" bash -s <<REMOTE_BUILD
set -euo pipefail
export PATH="\$HOME/.local/share/pnpm:\$HOME/.npm-global/bin:\$PATH"
cd /home/geinz/gcopilot
command -v pnpm >/dev/null || npm i -g pnpm@9.15.0
pnpm install --filter @goodagent/host... --filter @goodagent/runtime... --filter @goodagent/db... --filter @goodagent/shared...
if pnpm --filter @goodagent/db exec dotenv -e ../../.env -- prisma db push --accept-data-loss; then
  echo "db push ok"
else
  echo "WARN: db push skipped (database unreachable — continuing build)"
fi
pnpm --filter @goodagent/shared build
pnpm --filter @goodagent/db build
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
