param([int]$RetentionDays = 14)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupRoot = Join-Path $root 'backups'
$resolvedRoot = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
$resolvedBackup = [IO.Path]::GetFullPath($backupRoot).TrimEnd('\') + '\'
if (-not $resolvedBackup.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe backup path.' }
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss', [Globalization.CultureInfo]::InvariantCulture)
foreach ($database in @('chatwoot', 'typebot', 'keycloak', 'control_plane')) {
  $target = Join-Path $backupRoot "$database-$stamp.dump"
  docker compose exec -T postgres pg_dump -U postgres -Fc $database > $target
  if ($LASTEXITCODE -ne 0 -or (Get-Item -LiteralPath $target).Length -eq 0) { throw "Backup failed for $database." }
}

$cutoff = (Get-Date).AddDays(-[Math]::Abs($RetentionDays))
Get-ChildItem -LiteralPath $backupRoot -File -Filter '*.dump' |
  Where-Object { $_.LastWriteTime -lt $cutoff -and $_.FullName.StartsWith($resolvedBackup, [StringComparison]::OrdinalIgnoreCase) } |
  Remove-Item -Force
Write-Host "Database backups created in $backupRoot"
