$ErrorActionPreference = "Continue"
$lock = "D:\astra PM\logs\keep-runtimes.lock"
if (Test-Path $lock) {
  $wid = Get-Content $lock | Select-Object -First 1
  Write-Output ("LOCK {0}" -f $wid)
  $proc = Get-Process -Id $wid -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Output ("WATCHDOG_UP name={0} ws={1}MB" -f $proc.ProcessName, [math]::Round($proc.WorkingSet64/1MB,0))
  } else {
    Write-Output "WATCHDOG_DEAD"
  }
} else {
  Write-Output "NO_LOCK"
}
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*keep-runtimes*" } | ForEach-Object {
  $cl = $_.CommandLine
  if ($cl.Length -gt 220) { $cl = $cl.Substring(0,220) }
  Write-Output ("PROC pid={0} {1}" -f $_.ProcessId, $cl)
}
Write-Output "--- log ---"
Get-Content "D:\astra PM\logs\keep-runtimes.log" -Tail 40
