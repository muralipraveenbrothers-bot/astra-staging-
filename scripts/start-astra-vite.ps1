$ErrorActionPreference = "Continue"
$root = "D:\Astra pmb\astra-staging"
$conn = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Write-Output ("vite already on 5173 pid " + $conn.OwningProcess)
} else {
  New-Item -ItemType Directory -Force -Path "$root\logs" | Out-Null
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c","npm run dev > logs\astra-vite.out.log 2>&1" `
    -WorkingDirectory $root `
    -WindowStyle Minimized
  Write-Output "vite starting on 5173"
}
