# =============================================================================
# install-omniroute.ps1 - Windows installer for the EXTERNAL OmniRoute service
#
# What it does:
#   1. Detects an existing installation (Program Files app or portable copy)
#   2. If neither exists, installs a portable copy from the source tree
#   3. Configures it to serve on the port Astra expects (5171) and allows
#      Astra's origins for the embedded dashboard + LiveWS
#   4. Optionally registers auto-start with Windows (-RegisterAutostart)
#   5. Verifies the connection and prints a clear result
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-omniroute.ps1
#   powershell ... -RegisterAutostart     # also start OmniRoute at Windows boot
# =============================================================================
param(
  [switch]$RegisterAutostart,
  [int]$Port = 5171
)

$ErrorActionPreference = "Continue"
$root = "D:\astra PM"
$servicesRoot = "D:\astra-services"
$portablePath = Join-Path $servicesRoot "omniroute"
$sourcePath = Join-Path $root "OmniRoute"   # legacy bundled copy (no longer used at runtime)
$installedAppCandidates = @(
  "C:\Program Files\OmniRoute\OmniRoute.exe",
  "C:\Program Files (x86)\OmniRoute\OmniRoute.exe",
  "$env:LOCALAPPDATA\Programs\OmniRoute\OmniRoute.exe"
)

function Log([string]$m) { Write-Host ("[install-omniroute] " + $m) }

Log "=== OmniRoute external installation for Astra AI ==="

# ---- 1. Detect installation -------------------------------------------------
$installedApp = $installedAppCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($installedApp) {
  Log "FOUND installed Windows app: $installedApp"
} elseif (Test-Path $portablePath) {
  Log "FOUND portable external install: $portablePath"
} elseif (Test-Path $sourcePath) {
  Log "No external install found. Installing portable copy from bundled source..."
  New-Item -ItemType Directory -Force -Path $servicesRoot | Out-Null
  Move-Item -LiteralPath $sourcePath -Destination $portablePath -Force
  Log "Installed to $portablePath"
} else {
  Log "ERROR: no OmniRoute source found to install from."
  Log "Get the Windows installer/desktop app from the OmniRoute project, or"
  Log "clone the OmniRoute repository into: $portablePath"
  exit 1
}

# ---- 2. Configure port + Astra origins --------------------------------------
$serverEnvDir = Join-Path $env:APPDATA "omniroute"
$serverEnv = Join-Path $serverEnvDir "server.env"
New-Item -ItemType Directory -Force -Path $serverEnvDir | Out-Null
$envContent = if (Test-Path $serverEnv) { Get-Content $serverEnv -Raw } else { "" }
if ($envContent -notmatch "(?m)^PORT=") {
  Add-Content -Path $serverEnv -Value "`nPORT=$Port"
  Log "server.env: set PORT=$Port"
} elseif ($envContent -notmatch "(?m)^PORT=$Port\s*$") {
  ($envContent -replace "(?m)^PORT=.*$", "PORT=$Port") | Set-Content $serverEnv
  Log "server.env: updated PORT to $Port"
}
$origins = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:$Port,http://127.0.0.1:$Port"
if ($envContent -notmatch "LIVE_WS_ALLOWED_ORIGINS") {
  Add-Content -Path $serverEnv -Value "LIVE_WS_ALLOWED_ORIGINS=$origins"
  Log "server.env: allowed Astra dashboard origins"
}

# ---- 3. Portable install: production launcher -------------------------------
if (Test-Path $portablePath) {
  $starter = Join-Path $portablePath "start-external.cmd"
  @"
@echo off
rem External OmniRoute service launcher (installed by Astra install-omniroute)
cd /d "$portablePath"
if exist node_modules (
  set NODE_ENV=production
  node --max-old-space-size=4096 node_modules\next\dist\bin\next start -p $Port >> "%APPDATA%\omniroute\external-start.log" 2>&1
) else (
  echo node_modules missing - run: npm install  (in $portablePath)
  pause
)
"@ | Set-Content -Path $starter -Encoding ASCII
  Log "wrote external service launcher: $starter"
}

# ---- 4. Optional: auto-start with Windows -----------------------------------
if ($RegisterAutostart) {
  $startupDir = [Environment]::GetFolderPath("Startup")
  $shortcutContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """powershell.exe"" -NoProfile -ExecutionPolicy Bypass -File ""D:\astra PM\scripts\autoconnect-services.ps1""", 0, False
"@
  $shortcutContent | Set-Content (Join-Path $startupDir "astra-autoconnect.vbs") -Encoding ASCII
  Log "registered Windows auto-start: astra-autoconnect.vbs (Startup folder)"
}

# ---- 5. Verify connection ----------------------------------------------------
Log "starting service and verifying connection on :$Port ..."
if ($installedApp) { Start-Process -FilePath $installedApp -WindowStyle Hidden | Out-Null }
elseif (Test-Path $starter) { Start-Process "cmd.exe" -ArgumentList ('/c "' + $starter + '"') -WindowStyle Hidden | Out-Null }

$deadline = (Get-Date).AddSeconds(120)
$up = $false
while ((Get-Date) -lt $deadline) {
  if ($Port -in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port) { $up = $true; break }
  Start-Sleep -Seconds 3
}

if ($up) {
  Log "SUCCESS: OmniRoute external installation is CONNECTED on http://127.0.0.1:$Port"
  Log "Astra AI will auto-connect to it on every launch."
} else {
  Log "WARNING: service did not bind :$Port within 120s. Check %APPDATA%\omniroute\logs and external-start.log"
  Log "Astra will keep working and retry the connection automatically."
}
