# =============================================================================
# autoconnect-services.ps1 - Astra external-service AUTO-CONNECT engine
# Runs on EVERY Astra AI launch (start-astra.cmd step 0) and from the
# keep-runtimes watchdog. For each service in config/external-services.json:
#   1. Port already listening                    -> CONNECTED
#   2. External installation present (portable)  -> start it, wait, CONNECTED
#   3. FreeLLM internal mode                     -> start bundled copy
#   4. Nothing available                         -> OFFLINE (Astra continues)
# Writes logs/external-services-status.json every pass.
# =============================================================================
param(
  [switch]$Loop,
  [int]$IntervalSec = 45,
  [string]$Only = ""
)

$ErrorActionPreference = "Continue"
$root = "D:\Astra pmb\astra-staging"
$configPath = Join-Path $root "config\external-services.json"
$logDir = Join-Path $root "logs"
$statusPath = Join-Path $logDir "external-services-status.json"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Log([string]$msg) {
  $line = "[{0}] [autoconnect] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path (Join-Path $logDir "autoconnect.log") -Value $line
  # NOTE: no Write-Output here - stdout from helper calls would pollute the
  # $results += ... array in RunPass. The file log + status json are the output.
}

function PortUp([int]$port) {
  return $port -in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
}

function ExpandPath([string]$p) {
  if (-not $p) { return $null }
  return [Environment]::ExpandEnvironmentVariables($p)
}

function StartDetached([string]$exe, [string]$args, [string]$workdir) {
  # Start-Process rejects an explicitly empty ArgumentList. This path is used
  # for installed executables and was causing the FreeLLM recovery loop to
  # fail before the service could even be launched.
  if ($workdir -and (Test-Path $workdir)) {
    if ($args) {
      Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $workdir -WindowStyle Hidden | Out-Null
    } else {
      Start-Process -FilePath $exe -WorkingDirectory $workdir -WindowStyle Hidden | Out-Null
    }
  } else {
    if ($args) {
      Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden | Out-Null
    } else {
      Start-Process -FilePath $exe -WindowStyle Hidden | Out-Null
    }
  }
}

function WaitPort([int]$port, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (PortUp $port) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}
# ---- OmniRoute (external) ---------------------------------------------------
function Connect-OmniRoute($cfg) {
  $port = [int]$cfg.port
  if (PortUp $port) { return @{ name = "omniroute"; status = "CONNECTED"; detail = "listening on :$port" } }
  if (-not $cfg.autoConnect) { return @{ name = "omniroute"; status = "OFFLINE"; detail = "autoConnect disabled" } }

  $portable = ExpandPath $cfg.portablePath
  $installedApp = ExpandPath $cfg.installedAppPath
  $attempted = $false

  if ($portable -and (Test-Path $portable)) {
    $starter = Join-Path $portable "start-external.cmd"
    if (Test-Path $starter) {
      $attempted = $true
      Log "omniroute down -> starting portable install via start-external.cmd"
      StartDetached "cmd.exe" ('/c "' + $starter + '"') $portable
      if (WaitPort $port 120) { return @{ name = "omniroute"; status = "CONNECTED"; detail = "portable install started, listening on :$port" } }
      return @{ name = "omniroute"; status = "OFFLINE"; detail = "portable install started but :$port did not bind within 120s (health probe will retry)" }
    }
  }

  if ($installedApp -and (Test-Path $installedApp)) {
    $attempted = $true
    Log "omniroute down -> starting installed app ($installedApp)"
    StartDetached $installedApp "" $null
    if (WaitPort $port 90) { return @{ name = "omniroute"; status = "CONNECTED"; detail = "installed app started, listening on :$port" } }
    return @{ name = "omniroute"; status = "OFFLINE"; detail = "installed app started but :$port did not bind within 90s" }
  }

  if ($attempted) { return @{ name = "omniroute"; status = "OFFLINE"; detail = "started but unreachable (see logs\autoconnect.log)" } }
  return @{ name = "omniroute"; status = "OFFLINE"; detail = "not installed - run install-omniroute.cmd (installer detects the portable copy or Windows app)" }
}
# ---- FreeLLM API (internal bundled OR external) -----------------------------
function Connect-Freellm($cfg) {
  $port = [int]$cfg.port
  if (PortUp $port) { return @{ name = "freellm"; status = "CONNECTED"; detail = "listening on :$port (mode=$($cfg.mode))" } }
  if (-not $cfg.autoConnect) { return @{ name = "freellm"; status = "OFFLINE"; detail = "autoConnect disabled" } }

  if ($cfg.mode -eq "external") {
    $ext = ExpandPath $cfg.externalPath
    $starter = Join-Path $ext "start-external.cmd"
    if ($ext -and (Test-Path $starter)) {
      Log "freellm down -> starting EXTERNAL install via start-external.cmd"
      StartDetached "cmd.exe" ('/c "' + $starter + '"') $ext
      if (WaitPort $port 90) { return @{ name = "freellm"; status = "CONNECTED"; detail = "external install started on :$port" } }
    }
    return @{ name = "freellm"; status = "OFFLINE"; detail = "external mode but no install at $ext - run scripts\install-freellm.ps1" }
  }

  $internalStarter = Join-Path $root "start-freellmapi-server.cmd"
  if (Test-Path $internalStarter) {
    Log "freellm down -> starting INTERNAL bundled copy"
    StartDetached "cmd.exe" ('/c "' + $internalStarter + '"') $root
    if (WaitPort $port 90) { return @{ name = "freellm"; status = "CONNECTED"; detail = "internal bundled copy started on :$port" } }
  }
  return @{ name = "freellm"; status = "OFFLINE"; detail = "internal starter missing" }
}

# ---- Agent Bridge (internal, part of Astra workspace) -----------------------
function Connect-AgentBridge($cfg) {
  $port = [int]$cfg.port
  if (PortUp $port) { return @{ name = "agentBridge"; status = "CONNECTED"; detail = "listening on :$port" } }
  if (-not $cfg.autoConnect) { return @{ name = "agentBridge"; status = "OFFLINE"; detail = "autoConnect disabled" } }
  $starter = Join-Path $root "start-agent-bridge.cmd"
  if (Test-Path $starter) {
    StartDetached "cmd.exe" ('/c "' + $starter + '"') $root
    if (WaitPort $port 60) { return @{ name = "agentBridge"; status = "CONNECTED"; detail = "started on :$port" } }
  }
  return @{ name = "agentBridge"; status = "OFFLINE"; detail = "starter missing" }
}
# ---- Main pass --------------------------------------------------------------
function RunPass {
  if (-not (Test-Path $configPath)) {
    Log "config missing: $configPath - nothing to do"
    return
  }
  $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
  $results = @()
  if ($Only -eq "" -or $Only -eq "omniroute")   { $results += Connect-OmniRoute $cfg.omniroute }
  if ($Only -eq "" -or $Only -eq "freellm")     { $results += Connect-Freellm $cfg.freellm }
  if ($Only -eq "" -or $Only -eq "agentBridge") { $results += Connect-AgentBridge $cfg.agentBridge }

  $overall = "CONNECTED"
  foreach ($r in $results) { if ($r.status -ne "CONNECTED") { $overall = "PARTIAL" } }
  $out = [PSCustomObject]@{
    checkedAt = (Get-Date).ToString("o")
    overall   = $overall
    services  = $results
  }
  $out | ConvertTo-Json -Depth 4 | Set-Content -Path $statusPath
  foreach ($r in $results) { Log ("{0}: {1} - {2}" -f $r.name, $r.status, $r.detail) }
  Log "overall: $overall (status file: $statusPath)"
}

if ($Loop) {
  Log "autoconnect loop started (interval ${IntervalSec}s)"
  while ($true) {
    RunPass
    Start-Sleep -Seconds $IntervalSec
  }
} else {
  RunPass
  # Human-readable summary for manual runs
  Write-Output ""
  Write-Output "=== External services connection status ==="
  if (Test-Path $statusPath) {
    Get-Content $statusPath | Out-String | Write-Output
  }
}
