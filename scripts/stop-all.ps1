param([string]$StateFile = (Join-Path (Split-Path -Parent $PSScriptRoot) '_diagnostics\start-all-processes.json'))

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $StateFile)) {
  Write-Output 'No processes owned by start-all are recorded.'
  exit 0
}
$records = @(Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json)
$remaining = @()
foreach ($record in $records) {
  $process = Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  # PID reuse must never stop a different application.
  if ([string]$process.StartTime.ToUniversalTime().Ticks -ne [string]$record.startedAtTicks -or $process.Path -ne $record.executable) {
    Write-Output "Skipped PID $($record.pid): process identity no longer matches."
    continue
  }
  $command = (Get-CimInstance Win32_Process -Filter "ProcessId = $($record.pid)").CommandLine
  $entryName = [IO.Path]::GetFileName($record.entry)
  if (-not $command -or $command -notlike "*$entryName*") {
    Write-Output "Skipped PID $($record.pid): entry point does not match."
    $remaining += $record
    continue
  }
  try {
    if ($record.processTree -eq $true) {
      & taskkill.exe /pid $process.Id /T /F | Out-Null
    } else {
      Stop-Process -Id $process.Id -ErrorAction Stop
    }
    Write-Output "Stopped $($record.name) (PID $($record.pid))."
  } catch {
    Write-Output "Unable to stop $($record.name) (PID $($record.pid))."
    $remaining += $record
  }
}
ConvertTo-Json -InputObject @($remaining) -Depth 4 | Set-Content -LiteralPath $StateFile -Encoding UTF8
