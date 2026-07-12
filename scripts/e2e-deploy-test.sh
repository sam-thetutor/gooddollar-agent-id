#!/usr/bin/env bash
# End-to-end deploy test against goodagent-host (local or VPS).
set -euo pipefail

HOST_BASE="${HOST_BASE:-http://127.0.0.1:3010}"
OWNER="${OWNER:-0x85A4b09fb0788f1C549a68dC2EdAe3F97aeb5Dd7}"
NAME="${NAME:-E2E Deploy $(date +%H%M%S)}"
SKIP_IDENTITY="${SKIP_IDENTITY:-true}"
SKILL_ID="${SKILL_ID:-gaming/wagering/gamearena_1v1}"

echo "==> health ${HOST_BASE}"
curl -sf "${HOST_BASE}/health" | tee /tmp/host-health.json
echo

BODY=$(cat <<EOF
{
  "displayName": "${NAME}",
  "ownerWallet": "${OWNER}",
  "skillId": "${SKILL_ID}",
  "template": "gaming",
  "skipPayment": true,
  "configuration": {
    "WAGER_GS": "1",
    "GAME_TYPE": "0",
    "DAILY_LOSS_CAP_GS": "5",
    "MAX_MATCHES": "2",
    "MATCH_INTERVAL_SECONDS": "60"
  }
}
EOF
)

echo "==> create deploy"
CREATE=$(curl -sf -X POST "${HOST_BASE}/deploy" \
  -H 'Content-Type: application/json' \
  -d "$BODY")
echo "$CREATE"
DEPLOY_ID=$(echo "$CREATE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).agent.id));")
echo "deployId=${DEPLOY_ID}"

echo "==> run pipeline"
PIPE_BODY="{}"
if [[ "$SKIP_IDENTITY" == "true" ]]; then
  PIPE_BODY='{"skipIdentity":true}'
fi
curl -sf -X POST "${HOST_BASE}/deploy/${DEPLOY_ID}/run-pipeline" -H 'Content-Type: application/json' -d "$PIPE_BODY"
echo

echo "==> poll status"
for i in $(seq 1 48); do
  STATUS_JSON=$(curl -sf "${HOST_BASE}/deploy/${DEPLOY_ID}/status")
  echo "$STATUS_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); console.log(j.status, 'skill='+ (j.skillId||'-'), 'pm2='+ (j.pm2?.status||'-'), 'valid='+ (j.verify?.valid||false), j.agentAddress||''); if(j.lastError) console.error('ERR', j.lastError);});"
  FINAL=$(echo "$STATUS_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); if(['running','failed'].includes(j.status)&&!j.pipelineRunning) process.stdout.write(j.status);});")
  if [[ -n "$FINAL" ]]; then
    if [[ "$FINAL" != "running" ]]; then
      echo "FAILED"
      exit 1
    fi
    echo "SUCCESS"
    echo "$STATUS_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); console.log(JSON.stringify({deployId:j.id,skillId:j.skillId,agent:j.agentAddress,pm2:j.pm2,verify:{found:j.verify?.found,valid:j.verify?.valid,agentProven:j.verify?.agentProven}},null,2));});"
    exit 0
  fi
  sleep 5
done

echo "TIMEOUT"
exit 1
