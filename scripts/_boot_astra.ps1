# Boot Astra backend and report live status. Temp helper.
$ErrorActionPreference = "Continue"
$root = "D:\astra PM"
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Write-Output ("astra-api already on 3000 pid " + $conn.OwningProcess + " — not killing")
  exit 0
}
$tag = Get-Date -Format "HH:mm:ss"
$launcher = Join-Path $root "start-astra-api.cmd"
Start-Process -FilePath "cmd.exe" -ArgumentList ('/c "' + $launcher + '"') -WorkingDirectory $root -WindowStyle Minimized
Write-Output "relaunched at $tag; waiting..."
Start-Sleep -Seconds 22
$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { Write-Output "PORT 3000 UP pid=$($c.OwningProcess)" } else { Write-Output "PORT 3000 still DOWN" }
Write-Output "--- astra-api.log last 15 ---"
Get-Content (Join-Path $root "astra-api.log") -Tail 15