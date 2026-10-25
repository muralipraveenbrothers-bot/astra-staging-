$ErrorActionPreference = "Continue"
$os = Get-CimInstance Win32_OperatingSystem
$total = [math]::Round($os.TotalVisibleMemorySize/1MB, 1)
$free = [math]::Round($os.FreePhysicalMemory/1MB, 1)
$used = [math]::Round($total - $free, 1)
Write-Output "RAM total=${total}GB used=${used}GB free=${free}GB"

$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$ports = @(3000,3100,4000,5000,5171,5173,5678,6060,8080,9119,11434,17493,18000,18789,[int]$registry.services.freellmapi.port)
foreach ($p in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    $names = @()
    foreach ($pid in $pids) {
      try {
        $proc = Get-Process -Id $pid -ErrorAction Stop
        $ws = [math]::Round($proc.WorkingSet64/1MB, 0)
        $names += ("{0}:{1}({2}MB)" -f $proc.ProcessName, $pid, $ws)
      } catch {
        $names += ("gone:{0}" -f $pid)
      }
    }
    Write-Output ("UP   {0}  {1}" -f $p, ($names -join ", "))
  } else {
    Write-Output ("DOWN {0}" -f $p)
  }
}

# top memory processes
Write-Output "--- TOP MEM ---"
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 | ForEach-Object {
  $ws = [math]::Round($_.WorkingSet64/1MB, 0)
  Write-Output ("{0,7}MB  {1} pid={2}" -f $ws, $_.ProcessName, $_.Id)
}
