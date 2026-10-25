$ErrorActionPreference = "Continue"
$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$needed = @(
  @{ n = "freellmapi"; p = [int]$registry.services.freellmapi.port },
  @{ n = "paperclip"; p = 3100 },
  @{ n = "hermes"; p = 9119 },
  @{ n = "openclaw"; p = 18789 },
  @{ n = "astra-api"; p = 3000 },
  @{ n = "astra-ui"; p = 5173 },
  @{ n = "omniroute"; p = 5171 },
)
for ($i = 0; $i -lt 24; $i++) {
  $up = @()
  $down = @()
  foreach ($t in $needed) {
    $c = Get-NetTCPConnection -LocalPort $t.p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { $up += $t.n } else { $down += $t.n }
  }
  $os = Get-CimInstance Win32_OperatingSystem
  $free = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
  Write-Output ("t={0}s free={1}GB UP={2} DOWN={3}" -f ($i * 10), $free, ($up -join ","), ($down -join ","))
  if ($down.Count -eq 0) { break }
  Start-Sleep -Seconds 10
}
