#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 DOMAIN EMAIL [BRAND] [--no-start]" >&2
  exit 2
fi

DOMAIN="$1"
EMAIL="$2"
BRAND="${3:-My AI Desk}"
NO_START="${4:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ -e "$ENV_FILE" ]]; then
  echo ".env already exists; refusing to rotate secrets." >&2
  exit 1
fi

cp "$ROOT/.env.example" "$ENV_FILE"
alpha() { local value; value="$(openssl rand -hex "$1")"; printf '%s' "${value:0:$1}"; }
b64() { openssl rand -base64 "$1" | tr -d '\n'; }
replace() { sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; }

replace BASE_DOMAIN "${DOMAIN,,}"
replace ACME_EMAIL "$EMAIL"
replace TYPEBOT_ADMIN_EMAIL "$EMAIL"
replace BRAND_NAME "$BRAND"
replace POSTGRES_PASSWORD "$(alpha 40)"
replace REDIS_PASSWORD "$(alpha 40)"
replace CHATWOOT_SECRET_KEY_BASE "$(alpha 96)"
replace CHATWOOT_ACTIVE_RECORD_PRIMARY_KEY "$(alpha 32)"
replace CHATWOOT_ACTIVE_RECORD_DETERMINISTIC_KEY "$(alpha 32)"
replace CHATWOOT_ACTIVE_RECORD_SALT "$(alpha 32)"
replace TYPEBOT_ENCRYPTION_SECRET "$(alpha 32)"
replace MINIO_ROOT_PASSWORD "$(alpha 40)"
replace KEYCLOAK_ADMIN_PASSWORD "$(alpha 40)"
replace KEYCLOAK_USER_EMAIL "$EMAIL"
replace KEYCLOAK_USER_CONTACT_EMAIL "$EMAIL"
replace KEYCLOAK_USER_PASSWORD "$(alpha 32)"
replace KEYCLOAK_TYPEBOT_CLIENT_SECRET "$(alpha 48)"
replace KEYCLOAK_CONTROL_PLANE_CLIENT_SECRET "$(alpha 48)"
replace CHATWOOT_PLATFORM_API_TOKEN "$(alpha 48)"
replace WEBHOOK_SHARED_SECRET "$(alpha 48)"
replace BRIDGE_SERVICE_SECRET "$(alpha 48)"
replace META_VERIFY_TOKEN "$(alpha 48)"
replace CREDENTIAL_ENCRYPTION_KEY "$(b64 32)"

cd "$ROOT"
docker compose config --quiet
if [[ "$NO_START" != "--no-start" ]]; then
  docker compose up -d --build
  docker compose ps
fi
echo "Dashboard: https://dashboard.$DOMAIN"
