$ErrorActionPreference = "Continue"
Start-Sleep -Seconds 50
$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$ports = @(3000,3100,4000,5000,5171,5173,5678,6060,8080,9119,11434,17493,18000,18789,[int]$registry.services.freellmapi.port)
$up = @(); $down = @()
foreach ($p in $ports) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { $up += $p } else { $down += $p }
}
$os = Get-CimInstance Win32_OperatingSystem
$free = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
Write-Output ("RAM free={0}GB" -f $free)
Write-Output ("UP {0}" -f ($up -join ","))
Write-Output ("DOWN {0}" -f ($down -join ","))
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/runtime/status" -UseBasicParsing -TimeoutSec 10
  Write-Output $r.Content
} catch {
  Write-Output ("STATUS_FAIL " + $_.Exception.Message)
}
Write-Output "--- keep-runtimes.log tail ---"
Get-Content "D:\astra PM\logs\keep-runtimes.log" -Tail 25
