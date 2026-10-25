$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
. (Join-Path $PSScriptRoot 'start-all.helpers.ps1')

$registry = Get-Content -LiteralPath (Join-Path $repoRoot 'config/ports.json') -Raw | ConvertFrom-Json
$laya = $registry.services.laya
$port = [int]$laya.port
$healthUrl = "http://$($laya.host):$port/v1/health"
$python = Join-Path $repoRoot 'plugins/laya/.venv/Scripts/python.exe'
$entry = Join-Path $repoRoot 'server/plugins/astra_laya_server.py'
$logs = Join-Path $repoRoot 'logs'
$mainLog = Join-Path $logs 'laya.log'
$stdoutLog = Join-Path $logs 'laya-python.stdout.log'
$stderrLog = Join-Path $logs 'laya-python.stderr.log'
$policy = Get-AstraLayaWatchdogPolicy
$maxRestarts = $policy.MaxRestarts
$restartCount = 0
$backoffSeconds = 2
$everHealthy = $false
$startupDeadline = [DateTime]::UtcNow.AddSeconds($policy.StartupDeadlineSeconds)

New-Item -ItemType Directory -Force -Path $logs | Out-Null
$env:ASTRA_LAYA_CHECKPOINTS = 'typed-decisions'
$env:ASTRA_LAYA_PORT = [string]$port

function Write-LayaSupervisorLog([string]$Message) {
  try { Add-Content -LiteralPath $mainLog -Value $Message -ErrorAction Stop; return }
  catch {
    try { Add-Content -LiteralPath (Join-Path $logs 'laya-supervisor.log') -Value ($Message + ' main_log_unavailable=true') -ErrorAction Stop }
    catch { }
  }
}

while ($true) {
  $startingLine = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting Astra Laya on :$port restart=$restartCount"
  Write-LayaSupervisorLog $startingLine

  $process = Start-Process -FilePath $python -ArgumentList @(('"' + $entry + '"')) -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  $consecutiveFailures = 0
  $nextProbeAt = [DateTime]::UtcNow
  $restartReason = $null
  $exitCode = $null

  while ($true) {
    $process.Refresh()
    if ($process.HasExited) {
      $exitCode = $process.ExitCode
      $restartReason = 'process-exit'
      break
    }
    if ([DateTime]::UtcNow -ge $nextProbeAt) {
      $healthState = Get-AstraLayaHealthState -Uri $healthUrl
      $healthAction = Get-AstraLayaStartupAction -HealthState $healthState -EverReady $everHealthy -DeadlineReached ([DateTime]::UtcNow -ge $startupDeadline)
      $nextProbeAt = [DateTime]::UtcNow.AddSeconds($policy.ProbeIntervalSeconds)
      if ($healthAction -eq 'WAIT_LOADING') {
        $consecutiveFailures = 0
        Write-LayaSupervisorLog "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] MODEL_LOADING startup_deadline=$($policy.StartupDeadlineSeconds)s"
        continue
      }
      if ($healthAction -eq 'STARTUP_TIMEOUT') { $restartReason = 'startup-deadline'; break }
      $healthy = $healthAction -eq 'READY'
      $action = Get-AstraLayaWatchdogAction -Healthy $healthy -ProcessExited $false `
        -ConsecutiveFailures ($(if ($healthy) { 0 } else { $consecutiveFailures + 1 })) `
        -EverHealthy $everHealthy -RestartCount $restartCount -MaxRestarts $maxRestarts
      switch ($action) {
        'RESET_FAILURES' { $consecutiveFailures = 0; $everHealthy = $true }
        'STARTUP_GRACE' {
          $consecutiveFailures = 0
          if ([DateTime]::UtcNow -ge $startupDeadline) { $restartReason = 'startup-deadline'; break }
        }
        'COUNT_FAILURE' {
          $consecutiveFailures++
          Write-LayaSupervisorLog "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] WATCHDOG_HEALTH_FAILURE count=$consecutiveFailures"
        }
        'RESTART_HEALTH_FAILURES' { $restartReason = 'health-failures-3'; break }
        'EXHAUSTED' {
          & taskkill.exe /pid $process.Id /T /F | Out-Null
          try { $process.WaitForExit(15000) | Out-Null } catch { }
          Write-LayaSupervisorLog "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] LAYA_RESTART_EXHAUSTED restarts=$restartCount"
          exit 1
        }
      }
      if ($restartReason) { break }
    }
    Start-Sleep -Milliseconds 250
  }

  $process.Refresh()
  if (-not $process.HasExited) {
    try { & taskkill.exe /pid $process.Id /T /F | Out-Null } catch { }
  }
  try { $process.WaitForExit(15000) | Out-Null } catch { }
  $process.Refresh()
  if (-not $process.HasExited) {
    $failedKill = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] WATCHDOG_RESTART_FAILED reason=$restartReason process_tree_still_alive=true"
    Write-LayaSupervisorLog $failedKill
    exit 1
  }
  if ($null -eq $exitCode) { $exitCode = $process.ExitCode }
  $restartLine = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] WATCHDOG_RESTART reason=$restartReason exit_code=$exitCode"
  Write-LayaSupervisorLog $restartLine
  if ($restartCount -ge $maxRestarts) {
    Write-LayaSupervisorLog "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] LAYA_RESTART_EXHAUSTED restarts=$restartCount"
    exit 1
  }
  $restartCount++
  Start-Sleep -Seconds $backoffSeconds
  $backoffSeconds = [Math]::Min($backoffSeconds * 2, 60)
  $startupDeadline = [DateTime]::UtcNow.AddSeconds($policy.StartupDeadlineSeconds)
}
