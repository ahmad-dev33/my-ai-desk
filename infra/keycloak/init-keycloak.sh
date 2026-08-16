#!/usr/bin/env bash
set -euo pipefail

KC=/opt/keycloak/bin/kcadm.sh
until "$KC" config credentials --server http://keycloak:8080 --realm master \
  --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1; do
  sleep 3
done

if ! "$KC" get realms/unified >/dev/null 2>&1; then
  "$KC" create realms -s realm=unified -s enabled=true \
    -s registrationAllowed=false -s loginWithEmailAllowed=true \
    -s resetPasswordAllowed=true -s rememberMe=true
fi

create_or_update_client() {
  local client_id="$1"
  local public_client="$2"
  local secret="$3"
  local redirects="$4"
  local origins="$5"
  local existing=""
  local response
  response="$($KC get clients -r unified -q clientId="$client_id" --fields id 2>/dev/null)"
  if [[ "$response" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
    existing="${BASH_REMATCH[1]}"
  fi

  if [[ -z "$existing" ]]; then
    local args=(create clients -r unified -s "clientId=$client_id" -s enabled=true
      -s standardFlowEnabled=true -s directAccessGrantsEnabled=false
      -s "publicClient=$public_client" -s "redirectUris=$redirects" -s "webOrigins=$origins")
    if [[ "$public_client" == "false" ]]; then
      args+=(-s "secret=$secret")
    fi
    "$KC" "${args[@]}"
  else
    local args=(update "clients/$existing" -r unified -s enabled=true
      -s standardFlowEnabled=true -s "publicClient=$public_client"
      -s "redirectUris=$redirects" -s "webOrigins=$origins")
    if [[ "$public_client" == "false" ]]; then
      args+=(-s "secret=$secret")
    fi
    "$KC" "${args[@]}"
  fi
}

PUBLIC_BASE="${PUBLIC_SCHEME:-https}://dashboard.${BASE_DOMAIN}${PUBLIC_PORT_SUFFIX:-}"
FLOWS_BASE="${PUBLIC_SCHEME:-https}://flows.${BASE_DOMAIN}${PUBLIC_PORT_SUFFIX:-}"

create_or_update_client unified-dashboard true "" \
  "[\"${PUBLIC_BASE}/*\"]" \
  "[\"${PUBLIC_BASE}\"]"

create_or_update_client typebot false "$KEYCLOAK_TYPEBOT_CLIENT_SECRET" \
  "[\"${FLOWS_BASE}/api/auth/callback/custom-oauth\"]" \
  "[\"${FLOWS_BASE}\"]"

create_realm_role() {
  local role_name="$1"
  if ! "$KC" get "roles/$role_name" -r unified >/dev/null 2>&1; then
    "$KC" create roles -r unified -s "name=$role_name"
  fi
}

create_realm_role platform-admin
create_realm_role tenant-admin
create_realm_role operator
create_realm_role automation-editor

user_response="$($KC get users -r unified -q "email=$KEYCLOAK_USER_EMAIL" --fields id 2>/dev/null)"
user_id=""
if [[ "$user_response" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  user_id="${BASH_REMATCH[1]}"
fi
if [[ -z "$user_id" ]]; then
  "$KC" create users -r unified -s "username=$KEYCLOAK_USER_EMAIL" -s "email=$KEYCLOAK_USER_EMAIL" \
    -s enabled=true -s emailVerified=true
  user_response="$($KC get users -r unified -q "email=$KEYCLOAK_USER_EMAIL" --fields id)"
  if [[ "$user_response" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
    user_id="${BASH_REMATCH[1]}"
  fi
fi
"$KC" set-password -r unified --userid "$user_id" --new-password "$KEYCLOAK_USER_PASSWORD"
"$KC" add-roles -r unified --uid "$user_id" --rolename platform-admin >/dev/null

echo "Keycloak realm and OIDC clients are ready."
