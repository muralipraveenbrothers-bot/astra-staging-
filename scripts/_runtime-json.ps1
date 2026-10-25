$ErrorActionPreference = "Continue"
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/runtime/status" -UseBasicParsing -TimeoutSec 8
  Write-Output $r.Content
} catch {
  Write-Output ("STATUS_FAIL " + $_.Exception.Message)
}
