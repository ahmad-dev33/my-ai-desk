param([Parameter(Mandatory = $true)][int]$AccountId)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { throw "Run bootstrap first." }

$config = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') { $config[$matches[1].Trim()] = $matches[2].Trim() }
}
foreach ($name in @('BASE_DOMAIN', 'WEBHOOK_SHARED_SECRET', 'CHATWOOT_API_TOKEN')) {
  if (-not $config[$name] -or $config[$name].StartsWith('CHANGE_ME')) { throw "Set $name in .env first." }
}

$token = [Uri]::EscapeDataString($config.WEBHOOK_SHARED_SECRET)
$body = @{
  url = "https://hooks.$($config.BASE_DOMAIN)/webhooks/chatwoot?token=$token"
  name = "Typebot AI bridge"
  subscriptions = @("message_created")
} | ConvertTo-Json

$headers = @{ api_access_token = $config.CHATWOOT_API_TOKEN }
$result = Invoke-RestMethod -Method Post -Uri "https://inbox.$($config.BASE_DOMAIN)/api/v1/accounts/$AccountId/webhooks" `
  -Headers $headers -ContentType "application/json" -Body $body
$result | ConvertTo-Json -Depth 5
