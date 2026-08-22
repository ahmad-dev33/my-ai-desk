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
    -s resetPasswordAllowed=true -s rememberMe=true \
    -s loginTheme=my-ai-desk
else
  "$KC" update realms/unified -s loginTheme=my-ai-desk
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

create_or_update_client control-plane-admin false "$KEYCLOAK_CONTROL_PLANE_CLIENT_SECRET" \
  '[]' \
  '[]'

control_plane_client_response="$($KC get clients -r unified -q clientId=control-plane-admin --fields id)"
control_plane_client_id=""
if [[ "$control_plane_client_response" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  control_plane_client_id="${BASH_REMATCH[1]}"
fi
if [[ -z "$control_plane_client_id" ]]; then
  echo "Unable to resolve the Control Plane administration client UUID." >&2
  exit 1
fi

$KC update "clients/$control_plane_client_id" -r unified \
  -s standardFlowEnabled=false \
  -s directAccessGrantsEnabled=false \
  -s serviceAccountsEnabled=true

# Give the Control Plane service account only the user-management permissions it
# needs. It cannot manage realms, clients, or unrelated Keycloak configuration.
$KC add-roles -r unified \
  --uusername service-account-control-plane-admin \
  --cclientid realm-management \
  --rolename manage-users \
  --rolename view-users \
  --rolename query-users >/dev/null

typebot_client_response="$($KC get clients -r unified -q clientId=typebot --fields id)"
typebot_client_id=""
if [[ "$typebot_client_response" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  typebot_client_id="${BASH_REMATCH[1]}"
fi
if [[ -z "$typebot_client_id" ]]; then
  echo "Unable to resolve the Typebot client UUID." >&2
  exit 1
fi

# Typebot's custom OAuth adapter expects an `id` profile field, while OIDC
# exposes the stable user identifier as `sub`. Publish Keycloak's user ID as
# an additional `id` claim in every token/profile response.
mapper_response="$($KC get "clients/$typebot_client_id/protocol-mappers/models" -r unified \
  -q name=typebot-user-id --fields id 2>/dev/null)"
if [[ ! "$mapper_response" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  "$KC" create "clients/$typebot_client_id/protocol-mappers/models" -r unified \
    -s name=typebot-user-id \
    -s protocol=openid-connect \
    -s protocolMapper=oidc-usermodel-property-mapper \
    -s 'config."user.attribute"=id' \
    -s 'config."claim.name"=id' \
    -s 'config."jsonType.label"=String' \
    -s 'config."id.token.claim"=true' \
    -s 'config."access.token.claim"=true' \
    -s 'config."userinfo.token.claim"=true' \
    -s 'config."introspection.token.claim"=true'
fi

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

bootstrap_username="$KEYCLOAK_USER_EMAIL"
bootstrap_email="${KEYCLOAK_USER_CONTACT_EMAIL:-$bootstrap_username}"
if [[ "$bootstrap_email" != *"@"* ]]; then
  bootstrap_email="${bootstrap_username}@my-ai-desk.local"
fi

user_response="$($KC get users -r unified -q "username=$bootstrap_username" -q exact=true --fields id 2>/dev/null)"
user_id=""
if [[ "$user_response" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  user_id="${BASH_REMATCH[1]}"
fi
if [[ -z "$user_id" ]]; then
  "$KC" create users -r unified -s "username=$bootstrap_username" -s "email=$bootstrap_email" \
    -s firstName=Administrator -s "lastName=My AI Desk" \
    -s enabled=true -s emailVerified=true
  user_response="$($KC get users -r unified -q "username=$bootstrap_username" -q exact=true --fields id)"
  if [[ "$user_response" =~ \"id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
    user_id="${BASH_REMATCH[1]}"
  fi
fi
"$KC" update "users/$user_id" -r unified \
  -s "username=$bootstrap_username" -s "email=$bootstrap_email" \
  -s firstName=Administrator -s "lastName=My AI Desk" \
  -s enabled=true -s emailVerified=true
"$KC" set-password -r unified --userid "$user_id" --new-password "$KEYCLOAK_USER_PASSWORD"
"$KC" add-roles -r unified --uid "$user_id" --rolename platform-admin >/dev/null

echo "Keycloak realm and OIDC clients are ready."
