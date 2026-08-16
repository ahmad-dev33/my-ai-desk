param(
  [switch]$Update,
  [string]$ChatwootUrl = "https://github.com/chatwoot/chatwoot.git",
  [string]$TypebotUrl = "https://github.com/baptisteArno/typebot.io.git"
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$upstreams = Join-Path $root "upstreams"
New-Item -ItemType Directory -Force -Path $upstreams | Out-Null
$repos = @(
  @{ Name = "chatwoot"; Url = $ChatwootUrl; Branch = "develop" },
  @{ Name = "typebot"; Url = $TypebotUrl; Branch = "main" }
)
foreach ($repo in $repos) {
  $path = Join-Path $upstreams $repo.Name
  if (Test-Path (Join-Path $path ".git")) {
    if ($Update) {
      git -c http.version=HTTP/1.1 -C $path pull --ff-only
    } else {
      Write-Host "$($repo.Name) already exists; use -Update to pull."
    }
  } elseif (Test-Path $path) {
    throw "$path exists but is not a Git repository. Move or remove it first."
  } else {
    git -c http.version=HTTP/1.1 clone --depth 1 --filter=blob:none --single-branch --branch $repo.Branch $repo.Url $path
  }
}
