$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$apiBase = if ($env:ASTRA_API_URL) { $env:ASTRA_API_URL.TrimEnd('/') } else { "http://127.0.0.1:3000" }
$voiceboxBase = if ($env:VOICEBOX_BASE_URL) { $env:VOICEBOX_BASE_URL.TrimEnd('/') } else { "http://127.0.0.1:17493" }
$holoBase = if ($env:ASTRA_HOLO_URL) { $env:ASTRA_HOLO_URL.TrimEnd('/') } else { "http://127.0.0.1:4890" }

function Test-Endpoint([string]$Url) {
  try { Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

function Test-AstraApi([string]$Base) {
  try {
    $reply = Invoke-RestMethod -Uri "$Base/api/live" -TimeoutSec 2
    return ($reply.ok -eq $true -and $reply.service -eq "astra-core")
  } catch { return $false }
}

function Test-AstraFrontend {
  try {
    $reply = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:5173/" -TimeoutSec 2
    return ($reply.StatusCode -eq 200 -and $reply.Content -match '(?i)astra')
  } catch { return $false }
}

function Assert-PortAvailable([int]$Port) {
  # Fail visibly rather than terminating an unknown process or launching duplicates.
  $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $Port })
  if ($listeners.Count -gt 0) {
    $owners = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "Port $Port is occupied (PID $owners), but Astra did not pass its readiness check. Inspect that process and the Astra logs before restarting."
  }
}

Write-Host "Starting ASTRA SAARATHI through the existing Astra launchers..."
if (-not (Test-AstraApi $apiBase)) {
  if ($apiBase -notin @("http://127.0.0.1:3000", "http://localhost:3000")) {
    throw "Configured API $apiBase is unavailable. The local launcher only manages port 3000."
  }
  Assert-PortAvailable 3000
  $launcher = Join-Path $root "start-astra-api.cmd"
  if (-not (Test-Path -LiteralPath $launcher)) { throw "Existing Astra API launcher was not found." }
  Start-Process -FilePath $launcher -WorkingDirectory $root -WindowStyle Hidden
  $ready = $false
  foreach ($attempt in 1..30) { Start-Sleep -Milliseconds 500; if (Test-AstraApi $apiBase) { $ready = $true; break } }
  if (-not $ready) { throw "Astra API did not become ready. Check $(Join-Path $root 'astra-api.log')." }
}

if (-not (Test-AstraFrontend)) {
  Assert-PortAvailable 5173
  $frontendLauncher = Join-Path $root "start-astra-vite.cmd"
  if (-not (Test-Path -LiteralPath $frontendLauncher)) { throw "Existing Astra frontend launcher was not found." }
  Start-Process -FilePath $frontendLauncher -WorkingDirectory $root -WindowStyle Hidden
  $ready = $false
  foreach ($attempt in 1..30) { Start-Sleep -Milliseconds 500; if (Test-AstraFrontend) { $ready = $true; break } }
  if (-not $ready) { throw "Astra frontend did not become ready. Check $(Join-Path $root 'astra-vite.log')." }
}
if (-not (Test-AstraApi "http://localhost:5173")) {
  throw "Frontend is reachable, but its /api proxy is not reaching Astra. Check the API and Vite logs."
}
Write-Host "Astra frontend and API proxy ready: http://localhost:5173"

$voicebox = Test-Endpoint "$voiceboxBase/health"
Write-Host ("Voicebox: " + $(if ($voicebox) { "HEALTHY" } else { "OFFLINE (text remains available)" }))

if ($env:ASTRA_SAARATHI_GESTURES -eq "true") {
  if (-not (Test-Endpoint "$holoBase/api/tree")) {
    $holoHome = $env:ASTRA_HOLO_HOME
    if ($holoHome -and (Test-Path -LiteralPath (Join-Path $holoHome "server.py"))) {
      Start-Process -FilePath "python" -ArgumentList "server.py" -WorkingDirectory $holoHome -WindowStyle Hidden
    } else { Write-Warning "Gesture mode requested, but ASTRA_HOLO_HOME is not configured." }
  }
} else { Write-Host "HOLO gestures: DISABLED (safe default)" }

Write-Host "ASTRA SAARATHI is hosted inside the existing Astra API."
Write-Host "Verify after login: $apiBase/api/saarathi/health"
