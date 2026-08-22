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

@(
  'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'CHATWOOT_SECRET_KEY_BASE',
  'TYPEBOT_ENCRYPTION_SECRET', 'MINIO_ROOT_PASSWORD', 'KEYCLOAK_ADMIN_PASSWORD',
  'KEYCLOAK_TYPEBOT_CLIENT_SECRET', 'KEYCLOAK_CONTROL_PLANE_CLIENT_SECRET',
  'CHATWOOT_PLATFORM_API_TOKEN', 'WEBHOOK_SHARED_SECRET', 'BRIDGE_SERVICE_SECRET',
  'META_APP_SECRET', 'META_VERIFY_TOKEN', 'CREDENTIAL_ENCRYPTION_KEY'
) | ForEach-Object { Require-Value $_ 16 }
Require-Value 'META_APP_ID'
Require-Value 'META_OAUTH_REDIRECT_URI'

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
