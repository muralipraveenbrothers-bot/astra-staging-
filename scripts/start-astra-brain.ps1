$ErrorActionPreference = 'Stop'
$astraRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $astraRoot 'config\ai-gateway.env'

if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$' -and -not $line.TrimStart().StartsWith('#')) {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
  }
}

# Ports come from config/ports.json — the ONE place a port may be declared
# (see server/astra/supervisor/portRegistry.ts). This block used to hardcode the
# FreeLLMAPI and OmniRoute ports are read from the canonical registry.
# No port literal may be reintroduced here.
$registry = $null
$portsFile = Join-Path $astraRoot 'config\ports.json'
if (Test-Path -LiteralPath $portsFile) {
  try { $registry = (Get-Content -Raw -LiteralPath $portsFile | ConvertFrom-Json).services } catch { $registry = $null }
}

function Get-RegistryPort([string]$ServiceId, [int]$Fallback) {
  if (-not $registry) { return $Fallback }
  $entry = $registry.$ServiceId
  if ($entry -and $entry.port) { return [int]$entry.port }
  return $Fallback
}

$omniPort = Get-RegistryPort 'omniroute' 20128
$freePort = Get-RegistryPort 'freellmapi' 0
if ($freePort -le 0) { throw 'FreeLLMAPI port is missing from config/ports.json.' }
$omni = "http://127.0.0.1:$omniPort"
$free = "http://127.0.0.1:$freePort"
$gateway = $null
try { if ((Invoke-WebRequest -UseBasicParsing -Uri "$omni/api/health" -TimeoutSec 2).StatusCode -lt 400) { $gateway = $omni } } catch {}
if (-not $gateway) {
  try { if ((Invoke-WebRequest -UseBasicParsing -Uri "$free/health" -TimeoutSec 2).StatusCode -lt 400) { $gateway = $free } } catch {}
}
if (-not $gateway) {
  # config/ports.json declares FreeLLMAPI's health path as the OpenAI-compatible
  # /v1/models, so recognise the canonical gateway on that path too.
  try { if ((Invoke-WebRequest -UseBasicParsing -Uri "$free/v1/models" -TimeoutSec 2).StatusCode -lt 400) { $gateway = $free } } catch {}
}
if (-not $gateway) { throw "Neither OmniRoute :$omniPort nor FreeLLMAPI :$freePort is reachable." }

$token = $env:ANTHROPIC_AUTH_TOKEN
if (-not $token) { $token = $env:FREELLMAPI_API_KEY }
if (-not $token) { $token = $env:OMNIROUTE_API_KEY }
if (-not $token) { throw 'Set ANTHROPIC_AUTH_TOKEN or the configured gateway key before starting Astra Brain.' }

$env:ANTHROPIC_BASE_URL = $gateway
$env:ANTHROPIC_AUTH_TOKEN = $token
Remove-Item Env:\ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
$env:ASTRA_IDENTITY = 'ASTRA'
$env:ASTRA_VOICEBOX_URL = 'http://127.0.0.1:17493'
$claude = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claude) { throw 'Claude Code is not installed or not on PATH.' }
Write-Host "ASTRA Brain connected through $gateway"
& $claude.Source @args
