#!/usr/bin/env bash
# Install/refresh the AntSeed buyer proxy on the VPS (platform prerequisite
# for LLM brains — brains talk to http://localhost:8377/v1).
#
# Idempotent: safe to re-run. Does NOT touch ~/.antseed/identity.key — the
# identity holds the funded USDC deposit (G$ bridged via the GoodDollar
# AntSeed Worker), so back it up separately.
set -euo pipefail

REMOTE="${REMOTE:-geinz-vps}"

ssh "${REMOTE}" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail

if ! command -v antseed >/dev/null 2>&1; then
  echo "==> installing @antseed/cli globally"
  sudo npm install -g @antseed/cli
else
  echo "==> antseed CLI present: $(antseed --version 2>/dev/null || echo unknown)"
fi

CONFIG="$HOME/.antseed/config.json"
if [ ! -f "$CONFIG" ]; then
  echo "==> initializing antseed config"
  antseed config init >/dev/null 2>&1 || true
fi

# Default Tenderly RPC rate-limits — pin Base mainnet public RPC.
if [ -f "$CONFIG" ]; then
  python3 - "$CONFIG" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)
crypto = cfg.setdefault("payments", {}).setdefault("crypto", {})
if crypto.get("rpcUrl") != "https://mainnet.base.org":
    crypto["chainId"] = "base-mainnet"
    crypto["rpcUrl"] = "https://mainnet.base.org"
    with open(path, "w") as f:
        json.dump(cfg, f, indent=2)
    print("==> pinned Base RPC to https://mainnet.base.org")
else:
    print("==> Base RPC already pinned")
PY
fi

if pm2 describe antseed-buyer >/dev/null 2>&1; then
  echo "==> antseed-buyer already under PM2 — restarting"
  pm2 restart antseed-buyer
else
  echo "==> starting antseed-buyer under PM2"
  pm2 start "$(command -v antseed)" --name antseed-buyer -- buyer start
fi
pm2 save

sleep 3
echo "==> buyer proxy health:"
curl -sf http://localhost:8377/health 2>/dev/null || \
  curl -sf http://localhost:8377/v1/models 2>/dev/null | head -c 400 || \
  echo "(proxy still warming up — check: pm2 logs antseed-buyer)"
echo ""
echo "==> buyer identity/deposit status:"
antseed buyer status 2>/dev/null || true
echo ""
echo "NOTE: fund this buyer with G$ via the GoodDollar AntSeed Worker"
echo "      (host endpoint: POST /deploy/:id/credits/record) and set the"
echo "      deposits operator via the Worker operator-consent flow."
REMOTE_SCRIPT

echo "==> done"
