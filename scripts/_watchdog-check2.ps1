$ErrorActionPreference = "Continue"
Start-Sleep -Seconds 8
$lock = "D:\astra PM\logs\keep-runtimes.lock"
if (Test-Path $lock) {
  $wid = Get-Content $lock | Select-Object -First 1
  Write-Output ("LOCK {0}" -f $wid)
  $proc = Get-Process -Id $wid -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Output ("WATCHDOG_UP name={0}" -f $proc.ProcessName)
  } else {
    Write-Output "WATCHDOG_DEAD"
  }
} else {
  Write-Output "NO_LOCK"
}
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*keep-runtimes.ps1*" } | ForEach-Object {
  $cl = $_.CommandLine
  if ($cl.Length -gt 240) { $cl = $cl.Substring(0,240) }
  Write-Output ("PROC pid={0} {1}" -f $_.ProcessId, $cl)
}
Write-Output "--- log ---"
Get-Content "D:\astra PM\logs\keep-runtimes.log" -Tail 30
