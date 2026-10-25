# Quick live status of the core telephone ports. Temp helper.
$ErrorActionPreference = "Continue"
$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$ports = @([int]$registry.services.astra-api.port, [int]$registry.services.freellmapi.port, 5171, [int]$registry.services.astra-ui.port)
foreach ($p in $ports) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    $start = if ($proc) { $proc.StartTime.ToString("HH:mm:ss") } else { "?" }
    Write-Output ("PORT {0} LISTEN pid={1} start={2} name={3}" -f $p, $c.OwningProcess, $start, $proc.ProcessName)
  } else {
    Write-Output ("PORT {0} DOWN" -f $p)
  }
}
# hermes cli version probe (no key needed)
Write-Output "---"
$h = Get-ChildItem "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts\hermes.exe" -ErrorAction SilentlyContinue
if ($h) { Write-Output ("hermes cli present: " + $h.FullName) } else { Write-Output "hermes cli MISSING" }
