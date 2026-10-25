$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'start-all.helpers.ps1')
$script:polls = 0
Wait-AstraPortReleased -Port 12345 -Listeners {
  param($p)
  $script:polls++
  if ($script:polls -le 3) { [pscustomobject]@{ OwningProcess = 1 } }
} -Pause { }
if ($script:polls -ne 4) { throw 'slow release was not awaited' }
'PASS slow port release: four polls before restart permitted'
try {
  Wait-AstraPortReleased -Port 12345 -TimeoutSeconds 0 -Listeners { param($p) 1 } -Pause { }
  throw 'busy port was accepted'
} catch { if ($_.Exception.Message -notlike 'PORT_STILL_BUSY:*') { throw } }
'PASS busy port: PORT_STILL_BUSY'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('astra-ready-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  Set-Content -LiteralPath (Join-Path $temp 'Synthetic.stderr.log') -Value @('synthetic secret must be redacted', 'Error: Port 12345 is already in use')
  $child = [pscustomobject]@{ HasExited = $true; ExitCode = 1 }
  $child | Add-Member ScriptMethod Refresh { }
  $timer = [Diagnostics.Stopwatch]::StartNew()
  try {
    Assert-AstraChildrenAlive -Children @([pscustomobject]@{ Name = 'Synthetic'; Process = $child }) -LogDirectory $temp
    throw 'exited child was accepted'
  } catch { if ($_.Exception.Message -notlike 'CHILD_EXITED:*') { throw } }
  if ($timer.Elapsed.TotalSeconds -gt 2) { throw 'child failure was not immediate' }
  'PASS exited child: immediate failure and redacted stderr tail'
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
