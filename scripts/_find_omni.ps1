Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '5171|run-next|omniroute' } | ForEach-Object {
  $cmd = $_.CommandLine
  if ($cmd.Length -gt 140) { $cmd = $cmd.Substring(0, 140) }
  "$($_.ProcessId)  $cmd"
}