$os = Get-CimInstance Win32_OperatingSystem
$total = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$free = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
Write-Host "RAM: $total GB"
Write-Host "Free: $free GB"