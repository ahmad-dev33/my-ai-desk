#!/usr/bin/env bash
set -euo pipefail
ACCOUNT_ID="${1:?Usage: $0 CHATWOOT_ACCOUNT_ID}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
get_env() { sed -n "s/^$1=//p" "$ROOT/.env" | tail -n 1; }
BASE_DOMAIN="$(get_env BASE_DOMAIN)"
WEBHOOK_SHARED_SECRET="$(get_env WEBHOOK_SHARED_SECRET)"
CHATWOOT_API_TOKEN="$(get_env CHATWOOT_API_TOKEN)"
: "${BASE_DOMAIN:?}"
: "${WEBHOOK_SHARED_SECRET:?}"
: "${CHATWOOT_API_TOKEN:?}"

curl --fail-with-body -X POST "https://inbox.${BASE_DOMAIN}/api/v1/accounts/${ACCOUNT_ID}/webhooks" \
  -H "api_access_token: ${CHATWOOT_API_TOKEN}" -H "content-type: application/json" \
  --data "{\"url\":\"https://hooks.${BASE_DOMAIN}/webhooks/chatwoot?token=${WEBHOOK_SHARED_SECRET}\",\"name\":\"Typebot AI bridge\",\"subscriptions\":[\"message_created\"]}"
