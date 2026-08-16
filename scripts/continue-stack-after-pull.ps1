param([Parameter(Mandatory = $true)][int]$PullProcessId)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pullLog = Join-Path $root '.docker-sequential.out.log'
$runLog = Join-Path $root '.docker-stack.out.log'
$errorLog = Join-Path $root '.docker-stack.err.log'

try {
  Wait-Process -Id $PullProcessId -ErrorAction SilentlyContinue
  if (-not (Test-Path $pullLog) -or (Get-Content $pullLog -Raw) -notmatch 'All external images are available') {
    throw "Image pull did not finish successfully. Inspect .docker-sequential.err.log."
  }

  Push-Location $root
  try {
    docker compose up -d --build *>> $runLog
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed with exit code $LASTEXITCODE." }
    docker compose ps -a *>> $runLog
    docker compose logs --tail 80 *>> $runLog
  } finally {
    Pop-Location
  }
} catch {
  $_ | Out-String | Add-Content $errorLog
  exit 1
}
