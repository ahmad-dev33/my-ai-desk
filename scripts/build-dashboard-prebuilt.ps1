$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $root '.env'
$dashboard = Join-Path $root 'dashboard'

if (-not (Test-Path -LiteralPath $envFile)) {
  throw 'Missing .env. Run the bootstrap script first.'
}

$config = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
    $config[$matches[1].Trim()] = $matches[2].Trim()
  }
}

foreach ($name in @('BASE_DOMAIN', 'PUBLIC_SCHEME')) {
  if (-not $config[$name]) { throw "Missing $name in .env" }
}

$portSuffix = $config.PUBLIC_PORT_SUFFIX
$env:VITE_BRAND_NAME = $config.BRAND_NAME
$env:VITE_BRAND_PRIMARY = $config.BRAND_PRIMARY
$env:VITE_BASE_DOMAIN = $config.BASE_DOMAIN
$env:VITE_PUBLIC_SCHEME = $config.PUBLIC_SCHEME
$env:VITE_PUBLIC_PORT_SUFFIX = $portSuffix
$env:VITE_API_URL = "$($config.PUBLIC_SCHEME)://api.$($config.BASE_DOMAIN)$portSuffix"

Push-Location $dashboard
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

& docker build -t unified-ai-desk-dashboard:latest -f (Join-Path $dashboard 'Dockerfile.prebuilt') $dashboard
if ($LASTEXITCODE -ne 0) { throw "Dashboard image build failed with exit code $LASTEXITCODE" }

Push-Location $root
try {
  & docker compose up -d --no-deps --no-build --force-recreate dashboard
  if ($LASTEXITCODE -ne 0) { throw "Dashboard restart failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$bundle = Get-ChildItem -LiteralPath (Join-Path $dashboard 'dist\assets') -Filter '*.js' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
$contents = Get-Content -Raw -LiteralPath $bundle.FullName
$expectedParts = @($config.BASE_DOMAIN)
if ($portSuffix) { $expectedParts += $portSuffix }
foreach ($part in $expectedParts) {
  if (-not $contents.Contains($part)) {
    throw "Dashboard bundle verification failed: expected public setting $part"
  }
}
if ($config.BASE_DOMAIN -ne 'example.com' -and $contents.Contains('example.com')) {
  throw 'Dashboard bundle verification failed: default example.com leaked into the build'
}

Write-Host "Dashboard rebuilt for $($config.PUBLIC_SCHEME)://dashboard.$($config.BASE_DOMAIN)$portSuffix"
