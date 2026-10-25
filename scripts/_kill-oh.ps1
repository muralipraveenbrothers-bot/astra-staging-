# Kill processes bound to the OpenHands dev stack ports.
foreach ($port in 8080, 18000, 18001) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Write-Output "KILLED"