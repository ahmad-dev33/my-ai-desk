param(
  [string]$OAuthRedirectUri = '',
  [string]$NgrokConfigPath = "$env:LOCALAPPDATA/ngrok/ngrok.yml"
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $root '.env'

if (-not (Test-Path -LiteralPath $envPath)) {
  throw 'The .env file does not exist. Run scripts/bootstrap.ps1 first.'
}

function New-AlphaSecret([int]$Length) {
  $alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
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

function Set-EnvironmentValue([string]$Content, [string]$Name, [string]$Value, [switch]$OnlyWhenEmpty) {
  $escaped = [Regex]::Escape($Name)
  $pattern = "(?m)^$escaped=(.*)$"
  $match = [Regex]::Match($Content, $pattern)

  if ($match.Success) {
    if ($OnlyWhenEmpty -and -not [string]::IsNullOrWhiteSpace($match.Groups[1].Value)) {
      return $Content
    }
    return [Regex]::Replace($Content, $pattern, "$Name=$Value", 1)
  }

  $separator = if ($Content.EndsWith("`n")) { '' } else { "`r`n" }
  return "$Content$separator$Name=$Value`r`n"
}

$content = Get-Content -LiteralPath $envPath -Raw
$content = Set-EnvironmentValue $content 'META_APP_ID' '' -OnlyWhenEmpty
$content = Set-EnvironmentValue $content 'META_APP_SECRET' '' -OnlyWhenEmpty
$content = Set-EnvironmentValue $content 'META_VERIFY_TOKEN' (New-AlphaSecret 48) -OnlyWhenEmpty
$content = Set-EnvironmentValue $content 'CREDENTIAL_ENCRYPTION_KEY' (New-Base64Secret 32) -OnlyWhenEmpty
$content = Set-EnvironmentValue $content 'META_GRAPH_VERSION' 'v26.0' -OnlyWhenEmpty
$content = Set-EnvironmentValue $content 'META_ENABLE_COMMENT_MANAGEMENT' 'false' -OnlyWhenEmpty

$existingNgrokToken = [Regex]::Match($content, '(?m)^NGROK_AUTHTOKEN=(.*)$').Groups[1].Value.Trim()
if ([string]::IsNullOrWhiteSpace($existingNgrokToken) -and (Test-Path -LiteralPath $NgrokConfigPath)) {
  $ngrokConfig = Get-Content -LiteralPath $NgrokConfigPath -Raw
  $tokenMatch = [Regex]::Match($ngrokConfig, '(?m)^\s*authtoken\s*:\s*([^\s#]+)')
  if ($tokenMatch.Success) {
    $content = Set-EnvironmentValue $content 'NGROK_AUTHTOKEN' $tokenMatch.Groups[1].Value -OnlyWhenEmpty
  }
}
$content = Set-EnvironmentValue $content 'NGROK_VERSION' '3.39.11-alpine'

if (-not [string]::IsNullOrWhiteSpace($OAuthRedirectUri)) {
  $parsed = [Uri]$OAuthRedirectUri
  if ($parsed.Scheme -ne 'https') { throw 'OAuthRedirectUri must use HTTPS.' }
  $content = Set-EnvironmentValue $content 'META_OAUTH_REDIRECT_URI' $parsed.AbsoluteUri
} else {
  $content = Set-EnvironmentValue $content 'META_OAUTH_REDIRECT_URI' '' -OnlyWhenEmpty
}

[IO.File]::WriteAllText($envPath, $content, [Text.UTF8Encoding]::new($false))

Write-Host 'Meta local secrets are prepared in .env without printing their values.'
Write-Host 'The existing ngrok authentication is imported when available, without printing it.'
Write-Host 'META_APP_ID and META_APP_SECRET remain owner-supplied settings.'
