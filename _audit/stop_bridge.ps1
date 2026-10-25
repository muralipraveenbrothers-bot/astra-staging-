# Graceful shutdown of the Cognee bridge INCLUDING multiprocessing orphans.
# Force-killing only the parent leaves spawn_main children holding the Ladybug
# DB lock (Error 33) — see §61 finding #8.
$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*astra_cognee_bridge*' -or
  $_.CommandLine -like '*spawn_main(parent_pid*' -or
  $_.CommandLine -like '*from multiprocessing.spawn*'
}
if (-not $targets) { Write-Output "BRIDGE_NOT_RUNNING" }
foreach ($p in $targets) {
  Write-Output ("killing {0} {1}" -f $p.ProcessId, $p.Name)
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3
$left = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*astra_cognee_bridge*' -or $_.CommandLine -like '*spawn_main(parent_pid*'
}
Write-Output ("remaining: " + ($left | Measure-Object).Count)
