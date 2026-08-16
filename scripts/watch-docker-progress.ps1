$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pullPidFile = Join-Path $root '.docker-sequential.pid'
$continuationPidFile = Join-Path $root '.docker-continuation.pid'
$pullLog = Join-Path $root '.docker-sequential.out.log'
$pullErrorLog = Join-Path $root '.docker-sequential.err.log'
$stackLog = Join-Path $root '.docker-stack.out.log'
$stackErrorLog = Join-Path $root '.docker-stack.err.log'

Push-Location $root
try {
  while ($true) {
    $pullPid = if (Test-Path $pullPidFile) { [int](Get-Content $pullPidFile) }
    $continuationPid = if (Test-Path $continuationPidFile) { [int](Get-Content $continuationPidFile) }
    $pullRunning = $pullPid -and (Get-Process -Id $pullPid -ErrorAction SilentlyContinue)
    $continuationRunning = $continuationPid -and (Get-Process -Id $continuationPid -ErrorAction SilentlyContinue)

    $required = @(docker compose config --images |
      Where-Object { $_ -and $_ -notlike 'unified-ai-desk-*' } |
      Sort-Object -Unique)
    $installed = @(docker image ls --format '{{.Repository}}:{{.Tag}}')
    $available = @($required | Where-Object { $installed -contains $_ }).Count
    $lastHeading = Get-Content $pullLog -ErrorAction SilentlyContinue |
      Where-Object { $_ -like '=== Pulling *' } |
      Select-Object -Last 1

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Images ready: $available / $($required.Count)" -ForegroundColor Cyan

    if ($pullRunning) {
      Write-Host "Status: DOWNLOADING IMAGES" -ForegroundColor Yellow
      if ($lastHeading) { Write-Host $lastHeading }
    } elseif ($continuationRunning) {
      Write-Host "Status: BUILDING AND STARTING THE STACK" -ForegroundColor Yellow
      Get-Content $stackLog -Tail 5 -ErrorAction SilentlyContinue
    } else {
      $errors = @(
        Get-Content $pullErrorLog -ErrorAction SilentlyContinue
        Get-Content $stackErrorLog -ErrorAction SilentlyContinue
      ) | Where-Object { $_ }
      if ($errors.Count) {
        Write-Host "Status: FAILED" -ForegroundColor Red
        $errors | Select-Object -Last 20
      } else {
        Write-Host "Status: FINISHED. Container state:" -ForegroundColor Green
        docker compose ps -a
      }
      break
    }

    Write-Host "Press Ctrl+C to close this watcher only; downloads will continue.`n"
    Start-Sleep -Seconds 15
  }
} finally {
  Pop-Location
}
