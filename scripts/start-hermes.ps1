$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot 'config\ai-gateway.env'
if (-not (Test-Path $envFile)) { throw "Missing $envFile" }
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$' -and $Matches[2] -notmatch '^\s*#') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}
$env:HERMES_HOME = 'C:\h\hermes-home'
$env:HERMES_RUNTIME_DIR = 'C:\h\hermes-runtime'
$env:UV_PROJECT_ENVIRONMENT = 'C:\h\hermes-runtime\venv'
$env:UV_CACHE_DIR = 'C:\h\uv-cache'
$env:UV_PYTHON = 'C:\Python314\python.exe'
$env:PYTHONPATH = 'C:\h\hermes-agent'
Push-Location 'C:\h\hermes-agent'
try {
  & 'C:\Python314\python.exe' -m hermes_cli.main @args
  exit $LASTEXITCODE
} finally { Pop-Location }
