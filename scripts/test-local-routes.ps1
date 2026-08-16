param(
  [string]$EnvFile = (Join-Path $PSScriptRoot '..\.env')
)

$ErrorActionPreference = 'Stop'
$settings = @{}
Get-Content -LiteralPath $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $settings[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$domain = $settings.BASE_DOMAIN
$scheme = if ($settings.PUBLIC_SCHEME) { $settings.PUBLIC_SCHEME } else { 'https' }
$port = if ($settings.PUBLIC_PORT_SUFFIX) {
  $settings.PUBLIC_PORT_SUFFIX.TrimStart(':')
} elseif ($scheme -eq 'https') { '443' } else { '80' }
if (-not $domain) { throw 'BASE_DOMAIN is missing from .env' }

$checks = @(
  @{ Name = 'Dashboard'; Host = "dashboard.$domain"; Path = '/'; Allowed = @('200') },
  @{ Name = 'API'; Host = "api.$domain"; Path = '/health/ready'; Allowed = @('200') },
  @{ Name = 'Chatwoot'; Host = "inbox.$domain"; Path = '/'; Allowed = @('200', '302') },
  @{ Name = 'Typebot Builder'; Host = "flows.$domain"; Path = '/'; Allowed = @('200', '307') },
  @{ Name = 'Typebot Viewer'; Host = "bot.$domain"; Path = '/'; Allowed = @('200') },
  @{ Name = 'Keycloak'; Host = "auth.$domain"; Path = '/realms/unified/.well-known/openid-configuration'; Allowed = @('200') }
)

$failed = $false
foreach ($check in $checks) {
  $url = "${scheme}://$($check.Host):$port$($check.Path)"
  $code = & curl.exe -k -sS --max-time 20 -o NUL -w '%{http_code}' $url
  $ok = $check.Allowed -contains $code
  $state = if ($ok) { 'PASS' } else { 'FAIL' }
  "[{0}] {1}: HTTP {2}" -f $state, $check.Name, $code
  if (-not $ok) { $failed = $true }
}

$portSuffix = if ($settings.PUBLIC_PORT_SUFFIX) { $settings.PUBLIC_PORT_SUFFIX } else { '' }
$issuer = "${scheme}://auth.${domain}${portSuffix}/realms/unified/.well-known/openid-configuration"
$oidcProbe = docker compose exec -T typebot-builder node -e "fetch('$issuer').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.cause?.code||e.message);process.exit(1)})"
if ($LASTEXITCODE -eq 0 -and ($oidcProbe | Select-Object -Last 1) -eq '200') {
  '[PASS] Typebot -> Keycloak OIDC: HTTP 200'
} else {
  "[FAIL] Typebot -> Keycloak OIDC: $oidcProbe"
  $failed = $true
}

if ($failed) { exit 1 }
