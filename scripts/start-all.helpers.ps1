function Test-AstraLayaHealth {
  param([string]$Uri)
  $state = Get-AstraLayaHealthState -Uri $Uri
  return $state -in @('loading', 'ready', 'busy', 'insufficient_memory')
}

function Get-AstraLayaHealthState {
  param([string]$Uri)
  try {
    $body = Invoke-RestMethod -Uri $Uri -TimeoutSec 15
    if ($body.state) { return [string]$body.state }
    if ($body.reachable -eq $false) { return 'failed' }
    return 'ready' # compatibility with older Laya responses
  } catch { return 'unreachable' }
}

function Get-AstraLayaStartupAction {
  param([string]$HealthState, [bool]$EverReady, [bool]$DeadlineReached)
  if ($HealthState -eq 'insufficient_memory') { return 'DEGRADED_MEMORY' }
  if ($HealthState -eq 'loading' -and -not $EverReady) {
    if ($DeadlineReached) { return 'STARTUP_TIMEOUT' }
    return 'WAIT_LOADING'
  }
  if ($HealthState -in @('ready', 'busy') -or ($HealthState -eq 'loading' -and $EverReady)) { return 'READY' }
  return 'NOT_READY'
}

function Wait-AstraLayaReady {
  param([object]$Process, [string]$Uri, [string]$LogDirectory,
    [int]$TimeoutSeconds = 240,
    [scriptblock]$Probe = { param($url) Test-AstraLayaHealth -Uri $url },
    [scriptblock]$StateProbe = { param($url) Get-AstraLayaHealthState -Uri $url },
    [scriptblock]$Pause = { Start-Sleep -Milliseconds 500 })
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    Assert-AstraChildrenAlive -Children @([pscustomobject]@{ Name = 'Laya'; Process = $Process }) -LogDirectory $LogDirectory
    if (& $Probe $Uri) {
      $action = Get-AstraLayaStartupAction -HealthState (& $StateProbe $Uri) -EverReady $false -DeadlineReached ([DateTime]::UtcNow -ge $deadline)
      if ($action -eq 'READY') { return }
      if ($action -eq 'DEGRADED_MEMORY') { return 'insufficient_memory' }
      if ($action -eq 'STARTUP_TIMEOUT') { throw 'LAYA_UNHEALTHY: model remained loading for the 240-second startup deadline.' }
    }
    Assert-AstraChildrenAlive -Children @([pscustomobject]@{ Name = 'Laya'; Process = $Process }) -LogDirectory $LogDirectory
    if ([DateTime]::UtcNow -ge $deadline) { throw 'LAYA_UNHEALTHY: health did not return HTTP 200 within the readiness deadline.' }
    & $Pause
  } while ($true)
}

function Get-AstraLayaAction {
  param([bool]$Healthy, [bool]$PortBusy, [bool]$Owned)
  if ($Healthy) { return 'REUSE' }
  if ($Owned) { return 'RESTART' }
  if (-not $PortBusy) { return 'START' }
  Write-Warning 'LAYA_UNHEALTHY: listener exists but health did not return HTTP 200.'
  throw 'LAYA_UNHEALTHY: unhealthy listener is not launcher-owned; startup stopped.'
}

function Get-AstraLayaWatchdogPolicy {
  return [pscustomobject]@{ ProbeIntervalSeconds = 10; HealthTimeoutSeconds = 15; FailureThreshold = 3; MaxRestarts = 5; StartupDeadlineSeconds = 240 }
}

function Get-AstraLayaWatchdogAction {
  param(
    [bool]$Healthy,
    [bool]$ProcessExited,
    [int]$ConsecutiveFailures,
    [bool]$EverHealthy,
    [int]$RestartCount,
    [int]$MaxRestarts = 5
  )
  if ($RestartCount -ge $MaxRestarts) { return 'EXHAUSTED' }
  if ($ProcessExited) { return 'RESTART_PROCESS_EXIT' }
  if ($Healthy) { return 'RESET_FAILURES' }
  if (-not $EverHealthy) { return 'STARTUP_GRACE' }
  if ($ConsecutiveFailures -ge 3) { return 'RESTART_HEALTH_FAILURES' }
  return 'COUNT_FAILURE'
}

function Wait-AstraPortReleased {
  param([int]$Port, [int]$TimeoutSeconds = 15,
    [scriptblock]$Listeners = { param($p) @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) },
    [scriptblock]$Pause = { Start-Sleep -Milliseconds 250 })
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while (@(& $Listeners $Port).Count -gt 0) {
    if ([DateTime]::UtcNow -ge $deadline) { throw "PORT_STILL_BUSY: port $Port did not release within $TimeoutSeconds seconds." }
    & $Pause
  }
}

function Assert-AstraChildrenAlive {
  param([object[]]$Children, [string]$LogDirectory)
  foreach ($child in $Children) {
    $child.Process.Refresh()
    if ($child.Process.HasExited) {
      $log = Join-Path $LogDirectory ($child.Name + '.stderr.log')
      if (Test-Path -LiteralPath $log) {
        Get-Content -LiteralPath $log -Tail 15 | ForEach-Object {
          # stderr may contain arbitrary request data; only allow known startup diagnostics.
          if ($_ -match '^Error: Port \d+ is already in use$|^\s+at [A-Za-z0-9_.<>]+ \(' -and $_ -notmatch '(?i)key|token|secret|pin|patient|bearer|authorization') {
            Write-Host $_
          } else { Write-Host '[stderr line redacted]' }
        }
      }
      throw "CHILD_EXITED: $($child.Name) exited with code $($child.Process.ExitCode)."
    }
  }
}

function Expand-AstraOwnedEntries {
  param([object[]]$Entries)
  foreach ($entry in @($Entries)) {
    if ($entry -and $entry.PSObject.Properties.Name -contains 'value' -and $entry.value) {
      Expand-AstraOwnedEntries -Entries @($entry.value)
    } else {
      $entry
    }
  }
}

function Find-AstraOwnedListener {
  param(
    [object[]]$Entries,
    [string]$Name,
    [object[]]$ListenerPids
  )

  $normalizedListenerPids = @($ListenerPids | ForEach-Object {
    $candidate = 0
    if ([int]::TryParse([string]$_, [ref]$candidate)) { $candidate }
  })
  foreach ($entry in @(Expand-AstraOwnedEntries -Entries @($Entries))) {
    if (-not $entry -or $entry.name -ne $Name) { continue }
    foreach ($entryPid in @($entry.pid)) {
      $candidate = 0
      if ([int]::TryParse([string]$entryPid, [ref]$candidate) -and $normalizedListenerPids -contains $candidate) {
        return $entry
      }
    }
  }
  return $null
}
