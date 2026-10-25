# =============================================================================
# install-freellm.ps1 - FreeLLM API installation options for Astra AI
#
# FreeLLM API supports BOTH modes (config/external-services.json -> freellm.mode):
#   internal  (default)  - the bundled copy inside the Astra workspace starts
#                          automatically with Astra. Nothing to install.
#   external             - a SEPARATE Windows installation. This installer
#                          copies the bundled source out to D:\astra-services
#                          and switches Astra to connect to it.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-freellm.ps1 -Mode external
#   powershell ... -Mode internal          # switch back to the bundled copy
#   powershell ... -Mode external -RegisterAutostart
# =============================================================================
param(
  [ValidateSet("internal", "external")]
  [string]$Mode = "external",
  [switch]$RegisterAutostart,
  [int]$Port = 0
)

$ErrorActionPreference = "Continue"
$root = "D:\astra PM"
$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
if ($Port -le 0) { $Port = [int]$registry.services.freellmapi.port }
$servicesRoot = "D:\astra-services"
$externalPath = Join-Path $servicesRoot "freellmapi"
$internalPath = Join-Path $root "freellmapi"
$configPath = Join-Path $root "config\external-services.json"

function Log([string]$m) { Write-Host ("[install-freellm] " + $m) }

Log "=== FreeLLM API installation (mode: $Mode) for Astra AI ==="

if ($Mode -eq "external") {
  if (-not (Test-Path $externalPath)) {
    if (-not (Test-Path $internalPath)) {
      Log "ERROR: no freellmapi source found at $internalPath to install from."
      exit 1
    }
    Log "installing external copy -> $externalPath"
    Copy-Item -LiteralPath $internalPath -Destination $externalPath -Recurse -Force
    # external copy gets its own node_modules; drop the junctioned/copied one
    # if the copy was a live symlink-style dir
  }

  $starter = Join-Path $externalPath "start-external.cmd"
  @"
@echo off
rem External FreeLLM API service launcher (installed by Astra install-freellm)
cd /d "$externalPath"
if exist node_modules (
  node_modules\.bin\tsx.cmd src\index.ts >> "%LOGDIR%\freellm-external.log" 2>&1
) else (
  echo node_modules missing - run: npm install  (in $externalPath)
  pause
)
"@ | Set-Content -Path $starter -Encoding ASCII
  Log "wrote external service launcher: $starter"

  if (-not (Test-Path (Join-Path $externalPath "node_modules"))) {
    Log "installing dependencies (npm install) - this can take a few minutes..."
    Push-Location $externalPath
    & npm install --no-audit --no-fund 2>&1 | Select-Object -Last 3
    Pop-Location
  }

  # switch Astra config to external mode
  $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
  $cfg.freellm.mode = "external"
  $cfg.freellm.externalPath = $externalPath
  $cfg | ConvertTo-Json -Depth 6 | Set-Content $configPath
  Log "config: freellm.mode = external ($externalPath)"
} else {
  $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
  $cfg.freellm.mode = "internal"
  $cfg | ConvertTo-Json -Depth 6 | Set-Content $configPath
  Log "config: freellm.mode = internal (bundled copy inside Astra workspace)"
}

if ($RegisterAutostart) {
  $startupDir = [Environment]::GetFolderPath("Startup")
  $vbs = Join-Path $startupDir "astra-autoconnect.vbs"
  if (-not (Test-Path $vbs)) {
    @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """powershell.exe"" -NoProfile -ExecutionPolicy Bypass -File ""D:\astra PM\scripts\autoconnect-services.ps1""", 0, False
"@ | Set-Content $vbs -Encoding ASCII
  }
  Log "Windows auto-start registered: $vbs"
}

# verify
Log "verifying connection on :$Port ..."
if ($Port -notin [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port) {
  Log "service down - starting it now..."
  if ($Mode -eq "external") { Start-Process "cmd.exe" -ArgumentList ('/c "' + (Join-Path $externalPath "start-external.cmd") + '"') -WindowStyle Hidden | Out-Null }
  else { Start-Process "cmd.exe" -ArgumentList ('/c "' + (Join-Path $root "start-freellmapi-server.cmd") + '"') -WindowStyle Hidden | Out-Null }
  Start-Sleep -Seconds 15
}
if ($Port -in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port) {
  Log "SUCCESS: FreeLLM API CONNECTED on http://127.0.0.1:$Port (mode=$Mode). Astra auto-connects on every launch."
} else {
  Log "WARNING: not up yet; Astra will retry automatically on next launch / watchdog pass."
}
