$ports = 8000,8080,18000,18001
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort } |
  Select-Object LocalPort,OwningProcess -Unique | Sort-Object LocalPort | Format-Table -HideTableHeaders
