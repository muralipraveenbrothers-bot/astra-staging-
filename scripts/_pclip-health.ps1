$ErrorActionPreference = "Continue"
$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$freeOrigin = "http://$($registry.services.freellmapi.host):$($registry.services.freellmapi.port)"
foreach ($u in @(
  "http://127.0.0.1:3100/api/health",
  "http://127.0.0.1:3100/api",
  "$freeOrigin/",
  "http://127.0.0.1:9119/",
  "http://127.0.0.1:18789/"
)) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
    $body = ""
    if ($r.Content) { $body = $r.Content.Substring(0, [Math]::Min(180, $r.Content.Length)) }
    Write-Output ("OK {0} {1} {2}" -f $r.StatusCode, $u, $body)
  } catch {
    $code = ""
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Output ("FAIL {0} {1} {2}" -f $code, $u, $_.Exception.Message)
  }
}
