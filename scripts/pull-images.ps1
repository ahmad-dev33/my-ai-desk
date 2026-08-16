$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $root
try {
  $configuredImages = @(docker compose config --images |
    Where-Object { $_ -and $_ -notlike 'unified-ai-desk-*' } |
    Sort-Object -Unique)
  $preferredOrder = @(
    'redis:7.4-alpine',
    'postgres:16-alpine',
    'traefik:v3.5',
    'minio/mc:RELEASE.2025-07-21T05-28-08Z',
    'minio/minio:RELEASE.2025-07-23T15-54-02Z',
    'pgvector/pgvector:pg16',
    'quay.io/keycloak/keycloak:26.6.3',
    'chatwoot/chatwoot:v4.16.2-ce',
    'baptistearno/typebot-viewer:3.17.2',
    'baptistearno/typebot-builder:3.17.2'
  )
  $images = @(
    $preferredOrder | Where-Object { $configuredImages -contains $_ }
    $configuredImages | Where-Object { $preferredOrder -notcontains $_ }
  )

  foreach ($image in $images) {
    $attempt = 0
    $maxAttempts = 20
    while ($true) {
      $attempt++
      Write-Host "=== Pulling $image (attempt $attempt/$maxAttempts) ==="
      docker pull $image
      if ($LASTEXITCODE -eq 0) { break }
      if ($attempt -ge $maxAttempts) {
        throw "Failed to pull $image after $maxAttempts attempts."
      }
      $delay = [Math]::Min(60, 5 * $attempt)
      Write-Warning "Pull interrupted. Docker cache is preserved. Retrying in $delay seconds."
      Clear-DnsClientCache -ErrorAction SilentlyContinue
      Start-Sleep -Seconds $delay
    }
  }
  Write-Host "All external images are available."
} finally {
  Pop-Location
}
