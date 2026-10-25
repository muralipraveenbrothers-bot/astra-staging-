$ErrorActionPreference = "Continue"
function Probe($name, $url) {
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4 -MaximumRedirection 0 -ErrorAction Stop
    $sw.Stop()
    Write-Output ("OK   {0} {1} {2} {3}ms" -f $name, $r.StatusCode, $url, $sw.ElapsedMilliseconds)
  } catch {
    $code = ""
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $msg = $_.Exception.Message
    if ($msg.Length -gt 120) { $msg = $msg.Substring(0,120) }
    Write-Output ("FAIL {0} code={1} {2} {3}" -f $name, $code, $url, $msg)
  }
}

Probe "astra-live" "http://127.0.0.1:3000/api/live"
Probe "astra-status" "http://127.0.0.1:3000/api/runtime/status"
Probe "vite" "http://127.0.0.1:5173/"
$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$freeOrigin = "http://$($registry.services.freellmapi.host):$($registry.services.freellmapi.port)"
Probe "freellm-ping" "$freeOrigin/api/ping"
Probe "freellm-ui" "$freeOrigin/"
Probe "omni-health" "http://127.0.0.1:5171/api/health"
Probe "omni-root" "http://127.0.0.1:5171/"
Probe "paperclip" "http://127.0.0.1:3100/"
Probe "hermes" "http://127.0.0.1:9119/"
Probe "openclaw" "http://127.0.0.1:18789/"
Probe "litellm" "http://127.0.0.1:4000/health/liveliness"
Probe "routellm" "http://127.0.0.1:6060/health"
Probe "oh-ui" "http://127.0.0.1:8080/"
Probe "oh-api" "http://127.0.0.1:18000/server_info"
Probe "az" "http://127.0.0.1:5000/"
Probe "voicebox" "http://127.0.0.1:17493/health"
Probe "n8n" "http://127.0.0.1:5678/healthz"

# identify fat node
$n = Get-Process -Id 6820 -ErrorAction SilentlyContinue
if ($n) {
  Write-Output ("FAT_NODE pid=6820 ws={0}MB path={1}" -f ([math]::Round($n.WorkingSet64/1MB,0)), $n.Path)
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=6820").CommandLine
    if ($cmd.Length -gt 400) { $cmd = $cmd.Substring(0,400) }
    Write-Output ("FAT_CMD {0}" -f $cmd)
  } catch {}
}
