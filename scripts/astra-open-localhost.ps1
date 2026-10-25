# ASTRA AI - Open localhost reliably
# Starts API (3000) + frontend (5173) if missing, detached and hidden, then
# health-checks both and writes a machine-readable report so the result is
# verifiable without depending on terminal output capture.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "D:\astra PM\scripts\astra-open-localhost.ps1"
#
#   -NoBrowser   start + verify only; do not open a browser window.
#                Used by start-astra.cmd, which opens the browser itself.

param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Continue"

# Derive the project root from this script's own location (scripts\..) so the
# launcher is not bound to one hard-coded install path. PSScriptRoot is the
# folder holding this file, i.e. "<root>\scripts".
$root   = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$report = Join-Path $logDir "astra-open-localhost-report.json"
$viteLog = Join-Path $root "astra-vite.log"

$result = [ordered]@{
  startedAt   = (Get-Date).ToString("s")
  api         = "unknown"
  frontend    = "unknown"
  loopbackIpv4 = "unknown"
  loopbackHost = "unknown"
  vitePid     = $null
  apiPid      = $null
  viteLogTail = @()
  notes       = @()
}

function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Get-PortPid([int]$port) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.OwningProcess }
  return $null
}

function Wait-Http([string]$url, [int]$seconds) {
  for ($i = 0; $i -lt $seconds; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $url
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch { }
    Start-Sleep -Seconds 1
  }
  return $false
}

# ---------- 1. API on 3000 ----------
if (Test-Port 3000) {
  $result.api = "already-listening"
} else {
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$root\start-astra-api.cmd`"" -WorkingDirectory $root -WindowStyle Hidden
  $result.api = "started"
}
if (Wait-Http "http://127.0.0.1:3000/api/health" 45) { $result.api += "|healthy" } else { $result.api += "|unhealthy" }
$result.apiPid = Get-PortPid 3000

# ---------- 2. Frontend on 5173 ----------
# A leftover process can HOLD port 5173 without answering HTTP (zombie), which
# is indistinguishable from "not running" for the browser. Clear it first.
if ((Test-Port 5173) -and -not (Wait-Http "http://127.0.0.1:5173/" 5)) {
  $zombie = Get-PortPid 5173
  if ($zombie) {
    try {
      Stop-Process -Id $zombie -Force -ErrorAction Stop
      $result.notes += "Cleared zombie PID $zombie that held 5173 without serving"
    } catch {
      $result.notes += "Could not clear PID $zombie on 5173: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 3
  }
}

if (Test-Port 5173) {
  $result.frontend = "already-listening"
} else {
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$root\start-astra-vite.cmd`"" -WorkingDirectory $root -WindowStyle Hidden
  $result.frontend = "started"
}
if (Wait-Http "http://127.0.0.1:5173/" 60) { $result.frontend += "|healthy" } else { $result.frontend += "|unhealthy" }
$result.frontendPid = Get-PortPid 5173
$result.vitePid = $result.frontendPid

# ---------- 3. Verify BOTH loopback spellings ----------
try {
  $r4 = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:5173/"
  $result.loopbackIpv4 = "HTTP $($r4.StatusCode)"
} catch { $result.loopbackIpv4 = "FAILED: $($_.Exception.Message)" }

try {
  $rh = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://localhost:5173/"
  $result.loopbackHost = "HTTP $($rh.StatusCode)"
} catch { $result.loopbackHost = "FAILED: $($_.Exception.Message)" }

# ---------- 4. If frontend failed, capture WHY ----------
if ($result.frontend -like "*unhealthy*") {
  if (Test-Path $viteLog) {
    $result.viteLogTail = @(Get-Content $viteLog -Tail 60 -ErrorAction SilentlyContinue)
  } else {
    $result.notes += "astra-vite.log not found"
  }
  $result.notes += "Frontend never answered on 5173. See viteLogTail."
}

$result.finishedAt = (Get-Date).ToString("s")
$result | ConvertTo-Json -Depth 4 | Set-Content -Path $report -Encoding UTF8

# ---------- 5. Human-readable summary ----------
Write-Host ""
Write-Host "=========== ASTRA LOCALHOST STATUS ==========="
Write-Host "API      :3000 -> $($result.api)"
Write-Host "FRONTEND :5173 -> $($result.frontend)"
Write-Host "127.0.0.1:5173 -> $($result.loopbackIpv4)"
Write-Host "localhost:5173 -> $($result.loopbackHost)"
Write-Host "Report: $report"
Write-Host "=============================================="

if ($result.frontend -like "*healthy*") {
  if (-not $NoBrowser) {
    Start-Process "http://127.0.0.1:5173"
    Write-Host "Browser opened."
  }
} else {
  Write-Host "Frontend NOT healthy. Tail of astra-vite.log above / in report."
}
