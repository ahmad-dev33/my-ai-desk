$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace

docker compose -f docker-compose.yml -f docker-compose.low-memory.yml up -d
docker compose -f docker-compose.yml -f docker-compose.low-memory.yml ps

Write-Host ""
Write-Host "Low-memory mode is running. Current container usage:"
docker stats --no-stream --format "table {{.Name}}`t{{.MemUsage}}`t{{.CPUPerc}}"
