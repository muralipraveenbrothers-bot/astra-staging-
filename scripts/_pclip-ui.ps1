$ErrorActionPreference = "Continue"
foreach ($u in @(
  "http://127.0.0.1:3100/",
  "http://127.0.0.1:3100/ui",
  "http://127.0.0.1:3100/app",
  "http://127.0.0.1:3100/dashboard",
  "http://127.0.0.1:3100/index.html"
)) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 4 -MaximumRedirection 0 -ErrorAction Stop
    Write-Output ("OK {0} {1} len={2}" -f $r.StatusCode, $u, $r.RawContentLength)
  } catch {
    $code = ""
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Output ("FAIL {0} {1}" -f $code, $u)
  }
}
