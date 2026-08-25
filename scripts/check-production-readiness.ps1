param([string]$EnvironmentFile = '.env')

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = if ([IO.Path]::IsPathRooted($EnvironmentFile)) { $EnvironmentFile } else { Join-Path $root $EnvironmentFile }
if (-not (Test-Path -LiteralPath $envPath)) { throw "Environment file not found: $envPath" }

$config = @{}
Get-Content -LiteralPath $envPath | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') { $config[$matches[1].Trim()] = $matches[2].Trim() }
}

$errors = [Collections.Generic.List[string]]::new()
function Require-Value([string]$Name, [int]$MinimumLength = 1) {
  $value = [string]$config[$Name]
  if ([string]::IsNullOrWhiteSpace($value) -or $value -match 'CHANGE_ME|example\.com') {
    $errors.Add("$Name is missing or still uses an example value.")
  } elseif ($value.Length -lt $MinimumLength) {
    $errors.Add("$Name must contain at least $MinimumLength characters.")
  }
}

if ($config.BASE_DOMAIN -in @('', 'example.com', 'unified.localhost', 'localhost')) { $errors.Add('BASE_DOMAIN must be a real public domain.') }
if ($config.PUBLIC_SCHEME -ne 'https') { $errors.Add('PUBLIC_SCHEME must be https.') }
if ($config.TRAEFIK_TLS -ne 'true') { $errors.Add('TRAEFIK_TLS must be true.') }
if (-not [string]::IsNullOrWhiteSpace($config.PUBLIC_PORT_SUFFIX)) { $errors.Add('PUBLIC_PORT_SUFFIX must be empty in production.') }
if ($config.TYPEBOT_DISABLE_SIGNUP -ne 'true') { $errors.Add('TYPEBOT_DISABLE_SIGNUP must be true after the administrator is provisioned.') }
if ($config.AUTH_DISABLED -eq 'true') { $errors.Add('AUTH_DISABLED must be false in production.') }
if ($config.NODE_ENV -ne 'production') { $errors.Add('NODE_ENV must be production.') }
if ($config.PRODUCTION_MODE -ne 'true') { $errors.Add('PRODUCTION_MODE must be true.') }
if ($config.CHATWOOT_FORCE_SSL -ne 'true') { $errors.Add('CHATWOOT_FORCE_SSL must be true.') }
if ($config.META_ENABLE_COMMENT_MANAGEMENT -eq 'true') { $errors.Add('META_ENABLE_COMMENT_MANAGEMENT must remain false until comment management is implemented and approved.') }

@(
  'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'CHATWOOT_SECRET_KEY_BASE',
  'TYPEBOT_ENCRYPTION_SECRET', 'MINIO_ROOT_PASSWORD', 'KEYCLOAK_ADMIN_PASSWORD',
  'KEYCLOAK_TYPEBOT_CLIENT_SECRET', 'KEYCLOAK_CONTROL_PLANE_CLIENT_SECRET',
  'CHATWOOT_PLATFORM_API_TOKEN', 'WEBHOOK_SHARED_SECRET', 'BRIDGE_SERVICE_SECRET',
  'META_VERIFY_TOKEN', 'CREDENTIAL_ENCRYPTION_KEY'
) | ForEach-Object { Require-Value $_ 16 }
Require-Value 'META_OAUTH_REDIRECT_URI'
Require-Value 'LEGAL_ENTITY_NAME' 2
Require-Value 'PRIVACY_CONTACT_EMAIL' 5

$instagramAppId = if ($config.META_INSTAGRAM_APP_ID) { $config.META_INSTAGRAM_APP_ID } else { $config.META_APP_ID }
$instagramAppSecret = if ($config.META_INSTAGRAM_APP_SECRET) { $config.META_INSTAGRAM_APP_SECRET } else { $config.META_APP_SECRET }
if ([string]::IsNullOrWhiteSpace($instagramAppId) -or $instagramAppId -match 'CHANGE_ME') { $errors.Add('An Instagram App ID is required.') }
if ([string]::IsNullOrWhiteSpace($instagramAppSecret) -or $instagramAppSecret.Length -lt 16 -or $instagramAppSecret -match 'CHANGE_ME') { $errors.Add('The matching Instagram App Secret is required.') }
try {
  $redirect = [Uri]$config.META_OAUTH_REDIRECT_URI
  if ($redirect.Scheme -ne 'https') { $errors.Add('META_OAUTH_REDIRECT_URI must use HTTPS.') }
  if ($redirect.AbsolutePath -ne '/oauth/meta/callback') { $errors.Add('META_OAUTH_REDIRECT_URI must end with /oauth/meta/callback.') }
  if ($redirect.Host -match '(?i)localhost|ngrok-free\.(app|dev)$') { $errors.Add('META_OAUTH_REDIRECT_URI must use a permanent domain, not localhost or free ngrok.') }
} catch { $errors.Add('META_OAUTH_REDIRECT_URI is not a valid absolute URL.') }
if ($config.PRIVACY_CONTACT_EMAIL -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { $errors.Add('PRIVACY_CONTACT_EMAIL must be a valid email address.') }
if ([int]$config.DATA_RETENTION_DAYS -lt 30 -or [int]$config.DATA_RETENTION_DAYS -gt 730) { $errors.Add('DATA_RETENTION_DAYS must be between 30 and 730.') }

if ($errors.Count) {
  Write-Host 'Production readiness: FAILED' -ForegroundColor Red
  $errors | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Push-Location $root
try {
  docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Production Compose configuration is invalid.' }
} finally { Pop-Location }

Write-Host 'Production readiness: PASS' -ForegroundColor Green
