#!/usr/bin/env bash
# Simulate a short live MARKOV match against localhost host (UI smoke test).
set -euo pipefail

DEPLOY_ID="${1:-}"
HOST_URL="${GOODAGENT_HOST_URL:-http://127.0.0.1:3002}"
SECRET="${HOST_INTERNAL_SECRET:-}"

if [[ -z "$DEPLOY_ID" ]]; then
  echo "Usage: HOST_INTERNAL_SECRET=... $0 <deploy-id>" >&2
  exit 1
fi

if [[ -z "$SECRET" ]]; then
  echo "Set HOST_INTERNAL_SECRET (same as host .env)" >&2
  exit 1
fi

post() {
  curl -sf -X POST "${HOST_URL}/deploy/${DEPLOY_ID}/activity" \
    -H "Authorization: Bearer ${SECRET}" \
    -H "Content-Type: application/json" \
    -d "$1"
}

MID="sim-$(date +%s)"
post "$(jq -nc --arg m "$MID" '{
  type: "live_match",
  matchId: $m,
  phase: "starting",
  winsNeeded: 3,
  playerLabel: "Local test agent",
  score: { player: 0, ai: 0, ties: 0 }
}')"
sleep 1

for round in 1 2 3; do
  readLevel=$((40 + round * 15))
  aiWins=$((round >= 2 ? 2 : round - 1))
  post "$(jq -nc --arg m "$MID" --argjson r "$round" --argjson rl "$readLevel" --argjson aw "$aiWins" '{
    type: "live_match",
    matchId: $m,
    phase: "playing",
    winsNeeded: 3,
    playerLabel: "Local test agent",
    round: $r,
    playerMove: 0,
    aiMove: 1,
    playerMoveLabel: "Rock",
    roundResult: "loss",
    readLevel: $rl,
    markovLine: "Interesting choice.",
    score: { player: 0, ai: $aw, ties: 0 }
  }')"
  sleep 1.2
done

post "$(jq -nc --arg m "$MID" '{
  type: "live_match",
  matchId: $m,
  phase: "ended",
  winsNeeded: 3,
  playerLabel: "Local test agent",
  round: 3,
  playerMove: 2,
  aiMove: 0,
  playerMoveLabel: "Scissors",
  roundResult: "loss",
  score: { player: 0, ai: 3, ties: 0 },
  final: { outcome: "ai_won", totalRounds: 3, matchLine: "Pattern detected." }
}')"

echo "Done. Open deploy dashboard for ${DEPLOY_ID} — live arena should update every ~2s."
