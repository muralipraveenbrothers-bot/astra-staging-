# ASTRA AI - launch core AI stack (detached, idempotent). Temp helper.
$ErrorActionPreference = "Continue"
$root = "D:\astra PM"
$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$freePort = [int]$registry.services.freellmapi.port

function PortUp([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}
function LaunchCmd([string]$title, [string]$cmdPath) {
  if (-not (Test-Path $cmdPath)) { Write-Host "[MISSING] $title - $cmdPath"; return }
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$cmdPath`"" -WorkingDirectory $root -WindowStyle Minimized | Out-Null
  Write-Host "[LAUNCH] $title"
}

if (-not (PortUp $freePort)) { LaunchCmd "FreeLLMAPI gateway" (Join-Path $root "start-freellmapi-server.cmd") } else { Write-Host "[OK] FreeLLMAPI gateway already up" }
if (-not (PortUp 5171)) { LaunchCmd "OmniRoute :5171" (Join-Path $root "start-omniroute-5171.cmd") } else { Write-Host "[OK] OmniRoute :5171 already up" }
if (-not (PortUp 3000)) { LaunchCmd "Astra API :3000" (Join-Path $root "start-astra-api.cmd") } else { Write-Host "[OK] Astra API :3000 already up" }
if (-not (PortUp 5173)) { LaunchCmd "Astra Vite :5173" (Join-Path $root "start-astra-vite.cmd") } else { Write-Host "[OK] Astra Vite :5173 already up" }
Write-Host "Core launch commands issued."
