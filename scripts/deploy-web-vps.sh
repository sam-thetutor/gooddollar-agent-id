#!/usr/bin/env bash
# Build @goodagent/web and publish static assets to goodagentids.xyz on geinz-vps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${REMOTE:-geinz-vps}"
WEB_ROOT="/var/www/goodagentids"
STAGING="/home/geinz/goodagent-web-dist"

echo "==> build web locally"
cd "${ROOT}"
pnpm --filter @goodagent/shared build
pnpm --filter @goodagent/web build

echo "==> rsync dist to ${REMOTE}:${STAGING}"
ssh "${REMOTE}" "rm -rf ${STAGING} && mkdir -p ${STAGING}"
rsync -az --delete "${ROOT}/apps/web/dist/" "${REMOTE}:${STAGING}/"

echo "==> publish to ${WEB_ROOT}"
ssh "${REMOTE}" bash -s <<REMOTE
set -euo pipefail
sudo rsync -a --delete "${STAGING}/" "${WEB_ROOT}/"
sudo chown -R www-data:www-data "${WEB_ROOT}"
echo "published \$(find ${WEB_ROOT} -maxdepth 1 -type f | wc -l) top-level files"
REMOTE

echo "==> goodagentids.xyz web deploy complete"
