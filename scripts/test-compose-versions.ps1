$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$rendered = docker compose --project-directory $root -f (Join-Path $root "docker-compose.yml") config --format json | ConvertFrom-Json

$expectedTypebot = 'baptistearno/typebot-viewer:3.17.2'
$expectedChatwoot = 'chatwoot/chatwoot:v4.16.2-ce'

if ($rendered.services.'typebot-viewer'.image -ne $expectedTypebot) {
  throw "Unexpected Typebot image: $($rendered.services.'typebot-viewer'.image). Expected $expectedTypebot. Typebot Docker tags do not use a leading v."
}
if ($rendered.services.'typebot-builder'.image -ne 'baptistearno/typebot-builder:3.17.2') {
  throw "Unexpected Typebot builder image: $($rendered.services.'typebot-builder'.image)."
}
if ($rendered.services.'chatwoot-web'.image -ne $expectedChatwoot) {
  throw "Unexpected Chatwoot image: $($rendered.services.'chatwoot-web'.image). Expected $expectedChatwoot."
}

Write-Host "Compose image versions are valid."
