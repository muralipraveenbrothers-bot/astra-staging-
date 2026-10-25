# Idempotent companion-runtime keep-alive.
# NEVER kills Astra or a gateway process on its registry port.
# Only starts a process when its canonical port is not listening.
# Heavy starts are skipped when free RAM is too low (that is the cycling).
param(
  [switch]$Loop,
  [int]$IntervalSec = 45
)

$ErrorActionPreference = "Continue"
$root = "D:\astra PM"
$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$freePort = [int]$registry.services.freellmapi.port
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "keep-runtimes.log"

function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $log -Value $line
  Write-Output $line
}

function PortUp([int]$port) {
  return $port -in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
}

function FreeGB() {
  # Win32_OperatingSystem.FreePhysicalMemory is KB. A 0 reading is a probe
  # failure, not "no RAM" — return $null so callers do not skip Voicebox.
  try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $kb = [double]$os.FreePhysicalMemory
    if ($kb -gt 1024) { return [math]::Round($kb / 1MB, 2) }
  } catch { }
  try {
    $mb = (Get-Counter '\Memory\Available MBytes' -ErrorAction Stop).CounterSamples[0].CookedValue
    if ($mb -gt 1) { return [math]::Round($mb / 1024, 2) }
  } catch { }
  try {
    $bytes = (Get-Counter '\Memory\Available Bytes' -ErrorAction Stop).CounterSamples[0].CookedValue
    if ($bytes -gt 1MB) { return [math]::Round($bytes / 1GB, 2) }
  } catch { }
  return $null
}

function CooldownPath([int]$port) { return (Join-Path $logDir ("keep-cool-{0}.txt" -f $port)) }

function InCooldown([int]$port) {
  $p = CooldownPath $port
  if (-not (Test-Path $p)) { return $false }
  try {
    $when = [datetime](Get-Content $p -ErrorAction Stop | Select-Object -First 1)
    return ((Get-Date) - $when).TotalSeconds -lt 600
  } catch { return $false }
}

function MarkLaunched([int]$port) {
  Set-Content -Path (CooldownPath $port) -Value ((Get-Date).ToString("o"))
}

function LaunchCmd([string]$name, [string]$cmdPath) {
  if (-not (Test-Path $cmdPath)) {
    Log ("MISSING starter for {0}: {1}" -f $name, $cmdPath)
    return
  }
  $ext = [IO.Path]::GetExtension($cmdPath).ToLowerInvariant()
  if ($ext -eq ".ps1") {
    Start-Process -FilePath "powershell.exe" -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $cmdPath + '"') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir ((Split-Path $cmdPath -Leaf) + '.out.log')) -RedirectStandardError (Join-Path $logDir ((Split-Path $cmdPath -Leaf) + '.err.log')) | Out-Null
  } else {
    Start-Process -FilePath "cmd.exe" -ArgumentList ('/c ""' + $cmdPath + '""') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir ((Split-Path $cmdPath -Leaf) + '.out.log')) -RedirectStandardError (Join-Path $logDir ((Split-Path $cmdPath -Leaf) + '.err.log')) | Out-Null
  }
  Log ("LAUNCH {0} via {1}" -f $name, (Split-Path $cmdPath -Leaf))
}

function FillMissing() {
  $free = FreeGB
  Log ("RAM free={0}GB" -f $free)
  $script:startedThisPass = $false
  # Slow cold starts may take minutes before binding a port. A live launcher
  # is already working; do not pile another copy on top of it.
  $script:runtimeCommands = @(Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name='powershell.exe'" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CommandLine)

  function StartOne([string]$name, [int]$port, [double]$minFreeGb, [string]$starter) {
    if (PortUp $port) { Log ("OK {0} :{1}" -f $name, $port); return }
    $starterName = Split-Path $starter -Leaf
    if ($script:runtimeCommands | Where-Object { $_ -match [regex]::Escape($starterName) }) {
      Log ("WAIT {0} :{1} - existing launcher is still running" -f $name, $port)
      return
    }
    if (InCooldown $port) {
      Log ("WAIT {0} :{1} - launched recently, still booting" -f $name, $port)
      return
    }
    if ($Loop -and $script:startedThisPass) {
      Log ("DEFER {0} :{1} - one start per watchdog pass (anti-cycle)" -f $name, $port)
      return
    }
    $nowFree = FreeGB
    # Unknown/zero RAM probes must not disable Voicebox. Speech has no OS fallback.
    if ($name -eq "Voicebox" -and ($null -eq $nowFree -or $nowFree -le 0)) {
      Log ("WARN Voicebox :{0} - RAM probe unavailable; starting anyway" -f $port)
    } elseif ($null -ne $nowFree -and $nowFree -lt $minFreeGb) {
      Log ("SKIP {0} :{1} - RAM {2}GB < {3}GB" -f $name, $port, $nowFree, $minFreeGb)
      return
    }
    LaunchCmd ("{0} :{1}" -f $name, $port) $starter
    MarkLaunched $port
    $script:startedThisPass = $true
    if (-not $Loop) { Start-Sleep -Seconds 12 }
  }

  # Protected core - start only if down. Never Stop-Process these.
  StartOne "Astra API" 3000 0.5 (Join-Path $root "start-astra-api.cmd")
  StartOne "Astra UI" 5173 0.5 (Join-Path $root "start-astra-vite.cmd")
  StartOne "FreeLLMAPI gateway" $freePort 0.5 (Join-Path $root "scripts\start-freellm-mode.cmd")
  StartOne "Agent Bridge" 7771 0.5 (Join-Path $root "start-agent-bridge.cmd")
  StartOne "Hermes" 9119 1.0 (Join-Path $root "start-hermes.cmd")
  StartOne "Voicebox" 17493 0.8 (Join-Path $root "scripts\start-voicebox-server.ps1")
  StartOne "Medical MCP" 7010 0.4 (Join-Path $root "scripts\start-medical-mcp.ps1")
  StartOne "MedCalc MCP" 7016 0.5 (Join-Path $root "scripts\start-medcalc-mcp.ps1")
}

if ($Loop) {
  $mutex = [Threading.Mutex]::new($false, 'Local\AstraWorkspaceRuntimeLauncher')
  try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
  if (-not $owned) { $mutex.Dispose(); Write-Output 'Astra workspace launcher is already running.'; exit 0 }
  $lock = Join-Path $logDir "keep-runtimes.lock"
  if (Test-Path $lock) {
    $old = (Get-Content $lock -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($old) {
      $alive = Get-Process -Id $old -ErrorAction SilentlyContinue
      if ($alive -and $alive.ProcessName -eq 'powershell' -and (Get-CimInstance Win32_Process -Filter "ProcessId=$old" -ErrorAction SilentlyContinue).CommandLine -match 'keep-runtimes.ps1') {
        Log ("watchdog already running pid={0} - exiting" -f $old)
        $mutex.ReleaseMutex()
        $mutex.Dispose()
        exit 0
      }
    }
  }
  Set-Content -Path $lock -Value $PID
  Log ("watchdog start pid={0} interval={1}s" -f $PID, $IntervalSec)
  try {
    while ($true) {
      FillMissing
      Start-Sleep -Seconds $IntervalSec
    }
  } finally {
    if ((Get-Content $lock -ErrorAction SilentlyContinue) -eq "$PID") {
      Remove-Item $lock -ErrorAction SilentlyContinue
    }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
  }
} else {
  FillMissing
}
