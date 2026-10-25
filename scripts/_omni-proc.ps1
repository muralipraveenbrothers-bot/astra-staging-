Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match '5171|run-next' } |
  ForEach-Object { "{0}  {1}" -f $_.ProcessId, $_.CommandLine }