$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$ports = @(3000,3100,4000,5171,5173,5678,6060,8080,9119,17493,18789,[int]$registry.services.freellmapi.port)
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort } |
  Select-Object LocalPort,OwningProcess -Unique | Sort-Object LocalPort | Format-Table -HideTableHeaders
