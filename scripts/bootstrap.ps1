param(
  [Parameter(Mandatory = $true)][string]$Domain,
  [Parameter(Mandatory = $true)][string]$Email,
  [string]$Brand = "My AI Desk",
  [switch]$NoStart,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $root ".env"
$templatePath = Join-Path $root ".env.example"

if ((Test-Path $envPath) -and -not $Force) {
  throw ".env already exists. Use -Force only when you intentionally want new secrets."
}

function New-AlphaSecret([int]$Length) {
  $alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  $bytes = New-Object byte[] $Length
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}

function New-Base64Secret([int]$Length) {
  $bytes = New-Object byte[] $Length
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  [Convert]::ToBase64String($bytes)
}

$values = @{
  BASE_DOMAIN = $Domain.Trim().ToLowerInvariant()
  ACME_EMAIL = $Email
  TYPEBOT_ADMIN_EMAIL = $Email
  BRAND_NAME = $Brand
  POSTGRES_PASSWORD = New-AlphaSecret 40
  REDIS_PASSWORD = New-AlphaSecret 40
  CHATWOOT_SECRET_KEY_BASE = New-AlphaSecret 96
  CHATWOOT_ACTIVE_RECORD_PRIMARY_KEY = New-AlphaSecret 32
  CHATWOOT_ACTIVE_RECORD_DETERMINISTIC_KEY = New-AlphaSecret 32
  CHATWOOT_ACTIVE_RECORD_SALT = New-AlphaSecret 32
  TYPEBOT_ENCRYPTION_SECRET = New-AlphaSecret 32
  MINIO_ROOT_PASSWORD = New-AlphaSecret 40
  KEYCLOAK_ADMIN_PASSWORD = New-AlphaSecret 40
  KEYCLOAK_USER_EMAIL = $Email
  KEYCLOAK_USER_PASSWORD = New-AlphaSecret 32
  KEYCLOAK_TYPEBOT_CLIENT_SECRET = New-AlphaSecret 48
  WEBHOOK_SHARED_SECRET = New-AlphaSecret 48
}

$content = Get-Content -LiteralPath $templatePath -Raw
foreach ($entry in $values.GetEnumerator()) {
  $escaped = [Regex]::Escape($entry.Key)
  $content = [Regex]::Replace($content, "(?m)^$escaped=.*$", "$($entry.Key)=$($entry.Value)")
}
[IO.File]::WriteAllText($envPath, $content, [Text.UTF8Encoding]::new($false))

Push-Location $root
try {
  docker compose config --quiet
  if (-not $NoStart) {
    docker compose up -d --build
    docker compose ps
  }
} finally {
  Pop-Location
}

Write-Host "Configuration created at $envPath"
Write-Host "Dashboard: https://dashboard.$Domain"
if ($NoStart) { Write-Host "Validated only. Start with: docker compose up -d --build" }
