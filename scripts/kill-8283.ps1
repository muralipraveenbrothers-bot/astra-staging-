Get-NetTCPConnection -LocalPort 8283 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Output ("killed pid " + $_.OwningProcess)
  }
Write-Output "done"
