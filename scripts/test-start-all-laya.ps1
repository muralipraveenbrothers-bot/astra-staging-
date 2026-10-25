$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'start-all.helpers.ps1')
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'laya-supervisor.ps1'), [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -gt 0) { throw ($parseErrors | ForEach-Object Message | Out-String) }
'PASS watchdog script parses in Windows PowerShell'
if ((Get-AstraLayaAction -Healthy $true -PortBusy $true -Owned $false) -ne 'REUSE') { throw 'healthy reuse failed' }
'PASS healthy: reuse requires health HTTP 200'
if ((Get-AstraLayaAction -Healthy $false -PortBusy $true -Owned $true) -ne 'RESTART') { throw 'owned restart failed' }
if ((Get-AstraLayaAction -Healthy $false -PortBusy $false -Owned $true) -ne 'RESTART') { throw 'owned process without listener was not restarted' }
try {
  Get-AstraLayaAction -Healthy $false -PortBusy $true -Owned $false
  throw 'unowned listener accepted'
} catch { if ($_.Exception.Message -notlike 'LAYA_UNHEALTHY:*') { throw } }
'PASS busy unhealthy: owned restart, unowned refusal'
$child = [pscustomobject]@{ HasExited = $false; ExitCode = 1 }
$child | Add-Member ScriptMethod Refresh { }
Wait-AstraLayaReady -Process $child -Uri 'http://synthetic/v1/health' -LogDirectory $PSScriptRoot -Probe { param($url) $true } -StateProbe { param($url) 'ready' }
if ((Get-AstraLayaStartupAction -HealthState 'loading' -EverReady $false -DeadlineReached $false) -ne 'WAIT_LOADING') { throw 'loading state was not kept alive' }
if ((Get-AstraLayaStartupAction -HealthState 'loading' -EverReady $false -DeadlineReached $true) -ne 'STARTUP_TIMEOUT') { throw 'loading state exceeded startup deadline' }
if ((Get-AstraLayaStartupAction -HealthState 'loading' -EverReady $true -DeadlineReached $false) -ne 'READY') { throw 'loading state was not considered alive after readiness' }
if ((Get-AstraLayaStartupAction -HealthState 'ready' -EverReady $false -DeadlineReached $false) -ne 'READY') { throw 'ready state was rejected' }
if ((Get-AstraLayaStartupAction -HealthState 'insufficient_memory' -EverReady $false -DeadlineReached $false) -ne 'DEGRADED_MEMORY') { throw 'insufficient-memory state was not degraded gracefully' }
$degradedState = Wait-AstraLayaReady -Process $child -Uri 'http://synthetic/v1/health' -LogDirectory $PSScriptRoot -Probe { param($url) $true } -StateProbe { param($url) 'insufficient_memory' }
if ($degradedState -ne 'insufficient_memory') { throw 'memory guard state blocked launcher continuation' }
'PASS loading remains alive during model load, then obeys 240-second deadline'
$child.HasExited = $true
try {
  Wait-AstraLayaReady -Process $child -Uri 'http://synthetic/v1/health' -LogDirectory $PSScriptRoot -Probe { throw 'must check exit first' }
  throw 'exited child accepted'
} catch { if ($_.Exception.Message -notlike 'CHILD_EXITED:*') { throw } }
'PASS exited: fails before health polling'
if ((Get-AstraLayaWatchdogAction -Healthy $false -ProcessExited $false -ConsecutiveFailures 0 -EverHealthy $false -RestartCount 0) -ne 'STARTUP_GRACE') { throw 'startup grace was not honored' }
if ((Get-AstraLayaWatchdogAction -Healthy $true -ProcessExited $false -ConsecutiveFailures 2 -EverHealthy $true -RestartCount 0) -ne 'RESET_FAILURES') { throw 'healthy probe did not reset failures' }
if ((Get-AstraLayaWatchdogAction -Healthy $false -ProcessExited $false -ConsecutiveFailures 2 -EverHealthy $true -RestartCount 0) -ne 'COUNT_FAILURE') { throw 'first two failures must be counted without restart' }
if ((Get-AstraLayaWatchdogAction -Healthy $false -ProcessExited $false -ConsecutiveFailures 3 -EverHealthy $true -RestartCount 0) -ne 'RESTART_HEALTH_FAILURES') { throw 'third failure must restart' }
if ((Get-AstraLayaWatchdogAction -Healthy $false -ProcessExited $true -ConsecutiveFailures 0 -EverHealthy $false -RestartCount 0) -ne 'RESTART_PROCESS_EXIT') { throw 'process exit must restart' }
if ((Get-AstraLayaWatchdogAction -Healthy $false -ProcessExited $false -ConsecutiveFailures 3 -EverHealthy $true -RestartCount 5) -ne 'EXHAUSTED') { throw 'restart limit must stop after five' }
$policy = Get-AstraLayaWatchdogPolicy
if ($policy.ProbeIntervalSeconds -ne 10 -or $policy.HealthTimeoutSeconds -ne 15 -or $policy.FailureThreshold -ne 3 -or $policy.MaxRestarts -ne 5 -or $policy.StartupDeadlineSeconds -ne 240) { throw 'watchdog policy mismatch' }
'PASS watchdog: 10-second probe state, 15-second timeout, third-failure restart, 240-second startup deadline, max five restarts'
