# Kill the stale OmniRoute dev process bound to :5171.
Get-NetTCPConnection -LocalPort 5171 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    Write-Output "killed PID $_"
  }