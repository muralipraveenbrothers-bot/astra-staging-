param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$astraRoot = Split-Path -Parent $PSScriptRoot
if ($env:NODE_ENV -eq 'production') { throw 'Local startup is disabled in production.' }

# Load backend config without writing it or echoing its values.
$envFile = Join-Path $astraRoot 'config\ai-gateway.env'
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -notmatch '^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$') { continue }
    $name = $Matches[1]
    $value = $Matches[2]
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    } else { $value = ($value -replace '\s+#.*$', '').Trim() }
    if ($value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
  }
}
if ($env:NODE_ENV -eq 'production') { throw 'Local startup is disabled in production.' }

$registry = (Get-Content -LiteralPath (Join-Path $astraRoot 'config\ports.json') -Raw | ConvertFrom-Json).services
$gateway = $registry.freellmapi
$api = $registry.'astra-api'
$ui = $registry.'astra-ui'
$laya = $registry.laya
foreach ($entry in @($gateway, $api, $ui, $laya)) {
  if (-not $entry -or [int]$entry.port -le 0 -or $entry.host -ne '127.0.0.1') {
    throw 'Local startup requires valid loopback entries in config/ports.json.'
  }
}
$apiUrl = "http://$($api.host):$($api.port)"
$uiUrl = "http://$($ui.host):$($ui.port)/"
$gatewayUrl = "http://$($gateway.host):$($gateway.port)/v1/models"
$headers = @{}
if ($env:FREELLMAPI_API_KEY) { $headers.Authorization = "Bearer $($env:FREELLMAPI_API_KEY)" }
try {
  $probe = Invoke-WebRequest -UseBasicParsing -Uri $gatewayUrl -Headers $headers -TimeoutSec 8
  Write-Output "FreeLLMAPI HTTP $([int]$probe.StatusCode) on registry port $($gateway.port)."
} catch {
  if ($_.Exception.Response) {
    Write-Output "FreeLLMAPI HTTP $([int]$_.Exception.Response.StatusCode) on registry port $($gateway.port); check local authentication."
  } else { Write-Output "FreeLLMAPI unavailable on registry port $($gateway.port); continuing without starting it." }
} finally { $headers.Clear() }

$node = (Get-Command node -ErrorAction Stop).Source
$tsx = Join-Path $astraRoot 'node_modules\tsx\dist\cli.mjs'
$vite = Join-Path $astraRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $tsx) -or -not (Test-Path -LiteralPath $vite)) {
  throw 'Project dependencies are missing. Run npm install in the project folder first.'
}

if (-not $env:ASTRA_DATA_DIR) { $env:ASTRA_DATA_DIR = Join-Path $astraRoot 'data' }
$dataDir = [IO.Path]::GetFullPath($env:ASTRA_DATA_DIR)
$seedDir = Join-Path $astraRoot 'data\seed'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$copied = 0
if (Test-Path -LiteralPath $seedDir) {
  foreach ($seed in Get-ChildItem -LiteralPath $seedDir -File -Recurse) {
    # Vaults are provisioned locally, never distributed as seed credentials.
    if ($seed.Name -eq 'auth-vault.json') { continue }
    $relative = $seed.FullName.Substring($seedDir.Length).TrimStart([char[]]'\/')
    $destination = Join-Path $dataDir $relative
    if (-not (Test-Path -LiteralPath $destination)) {
      New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
      Copy-Item -LiteralPath $seed.FullName -Destination $destination
      $copied++
    }
  }
}
Write-Output "DATA_BOOTSTRAP copied=$copied"

Push-Location $astraRoot
try {
  & $node $tsx (Join-Path $PSScriptRoot 'seed-staff.ts')
  if ($LASTEXITCODE -ne 0) { throw 'Staff account provisioning failed; startup stopped.' }
} finally { Pop-Location }

# Do not pass bootstrap PINs to the long-running API or Vite processes.
Get-ChildItem Env: | Where-Object Name -Match '^ASTRA_SEED_.+_PIN$' | ForEach-Object {
  [Environment]::SetEnvironmentVariable($_.Name, $null, 'Process')
}
$env:PORT = [string]$api.port
$env:ASTRA_UI_PORT = [string]$ui.port
$env:ASTRA_SKIP_INTERNAL_SERVICE_AUTOSTART = '1'
$stateDir = Join-Path $astraRoot '_diagnostics'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$stateFile = Join-Path $stateDir 'start-all-processes.json'
$owned = @()
if (Test-Path -LiteralPath $stateFile) {
  $owned = @(Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json)
}
. (Join-Path $PSScriptRoot 'start-all.helpers.ps1')
$script:startedChildren = @()

function Start-AstraProcess([string]$Name, [int]$Port, [string]$Entry, [string[]]$Arguments) {
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  $listenerPids = @($listeners | ForEach-Object { $_.OwningProcess })
  $listener = $listeners | Select-Object -First 1
  if ($listener) {
    $ownedEntry = Find-AstraOwnedListener -Entries @($script:owned) -Name $Name -ListenerPids $listenerPids
    if ($ownedEntry) {
      $ownedListener = $listeners | Where-Object {
        $pidValue = 0
        [int]::TryParse([string]$_.OwningProcess, [ref]$pidValue) -and @($ownedEntry.pid) -contains $pidValue
      } | Select-Object -First 1
      if ($ownedListener) { $listener = $ownedListener }
    }
    $existing = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $latestCommitEpoch = 0
    $processEpoch = 0
    try {
      $latestCommitEpoch = [int64]((& git -C $astraRoot log -1 --format=%ct).Trim())
      if ($existing) { $processEpoch = [DateTimeOffset]::new($existing.StartTime).ToUnixTimeSeconds() }
    } catch {
      Write-Warning "STALE_CHECK_SKIPPED: could not compare API process age with latest commit; continuing startup."
    }
    $staleReasons = @()
    if ($processEpoch -and $processEpoch -lt $latestCommitEpoch) { $staleReasons += 'older than latest commit' }
    if ($listener.LocalAddress -ne '127.0.0.1' -and $listener.LocalAddress -ne '::1') { $staleReasons += "bound to $($listener.LocalAddress)" }
    if ($staleReasons.Count -gt 0) {
      Write-Warning "STALE_API: $Name PID $($listener.OwningProcess) is $($staleReasons -join ' and')."
      if ($ownedEntry) {
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        Wait-AstraPortReleased -Port $Port
      } else {
        Write-Output "$Name is not owned by this launcher; leaving it running."
        return
      }
    } else {
      Write-Output "$Name already listening on $Port; reusing it."
      return
    }
  }
  $process = Start-Process -FilePath $node -ArgumentList $Arguments -WorkingDirectory $astraRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $stateDir "$Name.stdout.log") -RedirectStandardError (Join-Path $stateDir "$Name.stderr.log")
  $script:startedChildren += [pscustomobject]@{ Name = $Name; Process = $process }
  $script:owned = @($script:owned | Where-Object name -NE $Name) + @(@{
    name = $Name; pid = $process.Id; startedAtTicks = [string]$process.StartTime.ToUniversalTime().Ticks
    executable = $node; entry = $Entry
  })
  ConvertTo-Json -InputObject @($script:owned) -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
  Write-Output "$Name started on $Port (PID $($process.Id))."
}

function Start-ManagedLaya {
  $layaPort = [int]$laya.port
  $healthUrl = "http://$($laya.host):$layaPort/v1/health"
  $listeners = @(Get-NetTCPConnection -LocalPort $layaPort -State Listen -ErrorAction SilentlyContinue)
  # Verify identity as well as PID before restarting an owned listener or wrapper.
  $ownedLaya = $null
  foreach ($record in @(Expand-AstraOwnedEntries -Entries @($script:owned))) {
    if ($record.name -ne 'Laya') { continue }
    $candidate = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
    if (-not $candidate -or [string]$candidate.StartTime.ToUniversalTime().Ticks -ne [string]$record.startedAtTicks -or $candidate.Path -ne $record.executable) { continue }
    $command = (Get-CimInstance Win32_Process -Filter "ProcessId = $($candidate.Id)").CommandLine
    if (-not $command -or $command -notlike "*$([IO.Path]::GetFileName($record.entry))*") { continue }
    # Retain ownership even if its listener vanished: the watchdog must be able
    # to replace an alive-but-unhealthy process instead of launching a duplicate.
    $ownedLaya = $record
    break
  }
  $action = Get-AstraLayaAction -Healthy (Test-AstraLayaHealth -Uri $healthUrl) -PortBusy ($listeners.Count -gt 0) -Owned ($null -ne $ownedLaya)
  if ($action -eq 'REUSE') {
    Write-Output "Laya healthy on $layaPort; reusing it."
    return
  }
  if ($action -eq 'RESTART') {
    if ($ownedLaya.processTree -eq $true) { & taskkill.exe /pid $ownedLaya.pid /T /F | Out-Null }
    else { Stop-Process -Id $ownedLaya.pid -Force -ErrorAction Stop }
    Wait-AstraPortReleased -Port $layaPort
  }
  $entry = Join-Path $PSScriptRoot 'start-laya.cmd'
  if (-not (Test-Path -LiteralPath $entry)) { throw 'Laya launcher missing.' }
  $process = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/s', '/c', ('""' + $entry + '""')) -WorkingDirectory $astraRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $stateDir 'Laya.stdout.log') -RedirectStandardError (Join-Path $stateDir 'Laya.stderr.log')
  $script:owned = @($script:owned | Where-Object name -NE 'Laya') + @(@{
    name = 'Laya'; pid = $process.Id; startedAtTicks = [string]$process.StartTime.ToUniversalTime().Ticks
    executable = $env:ComSpec; entry = $entry; processTree = $true
  })
  ConvertTo-Json -InputObject @($script:owned) -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
  Write-Output "Laya start requested on $layaPort (launcher PID $($process.Id))."
  $layaReadyState = Wait-AstraLayaReady -Process $process -Uri $healthUrl -LogDirectory $stateDir
  if ($layaReadyState -eq 'insufficient_memory') {
    Write-Warning "Laya process is reachable on $layaPort but its model was not loaded (insufficient memory); Astra will continue in degraded mode."
  } else {
    Write-Output "Laya healthy on $layaPort."
  }
}

if ($env:ASTRA_LAYA_ENABLED -eq '0') {
  Write-Output 'Laya startup skipped (ASTRA_LAYA_ENABLED=0).'
} else {
  Start-ManagedLaya
}
Start-AstraProcess 'AstraAPI' ([int]$api.port) (Join-Path $astraRoot 'server\index.ts') @('--import', 'tsx', 'server/index.ts')
Start-AstraProcess 'AstraUI' ([int]$ui.port) $vite @('node_modules/vite/bin/vite.js', '--host', $ui.host, '--port', [string]$ui.port, '--strictPort')

$deadline = (Get-Date).AddSeconds(90)
$ready = $false
do {
  Assert-AstraChildrenAlive -Children $script:startedChildren -LogDirectory $stateDir
  try {
    $health = Invoke-RestMethod -Uri "$apiUrl/api/live" -TimeoutSec 3
    $page = Invoke-WebRequest -UseBasicParsing -Uri $uiUrl -TimeoutSec 3
    if ($health.ok -eq $true -and $health.service -eq 'astra-core' -and $page.StatusCode -eq 200 -and $page.Content -match '/@vite/client') {
      $ready = $true
      break
    }
  } catch { }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
if (-not $ready) { throw 'Astra did not become ready within 90 seconds. Inspect _diagnostics/AstraAPI.stderr.log and AstraUI.stderr.log locally.' }
Write-Output "ASTRA_LIVE ok=true service=astra-core; UI_HTTP=200"
Write-Output "Preview: $uiUrl"
if (-not $NoBrowser) { Start-Process $uiUrl | Out-Null }
