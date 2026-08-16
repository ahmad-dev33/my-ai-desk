$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Push-Location $root
try {
  Write-Host "Downloading required Docker images. Progress is shown per layer." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'pull-images.ps1')
  if ($LASTEXITCODE -ne 0) { throw "Image download failed." }

  Write-Host "Images complete. Building and starting the stack..." -ForegroundColor Cyan
  docker compose up -d --build
  if ($LASTEXITCODE -ne 0) { throw "Stack startup failed." }

  Write-Host "Stack startup finished." -ForegroundColor Green
  docker compose ps -a
} finally {
  Pop-Location
}
