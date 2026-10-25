# Restart Astra backend to reload server-code changes. Temp helper.
$ErrorActionPreference = "Continue"
$root = "D:\astra PM"
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Write-Output "stopping pid $($conn.OwningProcess) on :3000"
  Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
} else {
  Write-Output "no :3000 listener - skipping stop"
}
Start-Sleep -Seconds 3
Start-Process -FilePath "cmd.exe" -ArgumentList '/c', (Join-Path $root "start-astra-api.cmd") -WorkingDirectory $root -WindowStyle Minimized
Write-Output "astra-api relaunched"