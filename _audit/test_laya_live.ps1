# ASTRA — live Laya loopback integration test (boot -> health -> decide -> policy -> shutdown)
$ErrorActionPreference = 'Stop'
$root = 'D:\astra PM'
$py   = Join-Path $root 'plugins\laya\.venv\Scripts\python.exe'
$srv  = Join-Path $root 'server\plugins\astra_laya_server.py'
$out  = Join-Path $root '_audit\laya-live.out.log'
$err  = Join-Path $root '_audit\laya-live.err.log'
$base = 'http://127.0.0.1:8791'
Remove-Item $out, $err -ErrorAction SilentlyContinue

Write-Host '[boot] launching Laya runtime...'
$proc = Start-Process -FilePath $py -ArgumentList "`"$srv`"" -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err -PassThru

function Fail($msg) {
  Write-Host "FAIL: $msg" -ForegroundColor Red
  if (Test-Path $err) { Write-Host '--- stderr tail ---'; Get-Content $err -Tail 25 }
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  exit 1
}

# 1) health — first call triggers Router preload; generous deadline for cold cache
$health = $null
$deadline = (Get-Date).AddMinutes(8)
while ((Get-Date) -lt $deadline) {
  if ($proc.HasExited) { Fail "process exited with code $($proc.ExitCode)" }
  try {
    $health = Invoke-RestMethod -Uri "$base/v1/health" -Method Get -TimeoutSec 150
    if ($health.reachable) { break }
  } catch { Start-Sleep -Seconds 3 }
}
if (-not $health -or -not $health.reachable) { Fail 'health never became reachable' }
Write-Host "PASS health: reachable=$($health.reachable) modelLoaded=$($health.modelLoaded) device=$($health.device) probe=$($health.probeLatencyMs)ms"

# 2) decide — exact TS LAYA_TASK_QUESTIONS contract body for urgency_classification
$body = '{"task":"urgency_classification","state":"Patient reports crushing chest pain since 30 minutes with sweating and nausea.","questions":{"urgency":{"type":"score","instructions":"How urgent is this request for the hospital?","criteria":["routine","soon","urgent","immediately life-threatening"]}}}'
try {
  $r = Invoke-RestMethod -Uri "$base/v1/decide" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 300
} catch { Fail "decide threw: $_" }

if (-not $r.ok) { Fail "decide ok!=true: $($r | ConvertTo-Json -Depth 6)" }
$a = $r.answers.urgency
if ($null -eq $a) { Fail "answers.urgency missing: $($r | ConvertTo-Json -Depth 6)" }
if ($a.type -ne 'score') { Fail "type=$($a.type), expected score" }
if ($null -eq $a.confidence -or $a.confidence -lt 0 -or $a.confidence -gt 1) { Fail "confidence invalid: $($a.confidence)" }
if ($null -eq $a.score -or $a.score -lt 0 -or $a.score -gt 4) { Fail "score invalid: $($a.score)" }
if ($r.scoreMeaning -ne 'routing_confidence_not_clinical_probability') { Fail "scoreMeaning=$($r.scoreMeaning)" }
if (-not $r.clinicalValidationGate -or $r.clinicalValidationGate.Count -lt 1) { Fail 'clinicalValidationGate missing' }
Write-Host "PASS decide: type=$($a.type) score=$($a.score) confidence=$($a.confidence) model=$($r.model) latency=$($r.latencyMs)ms"

# 3) policy — diagnose_patient must be refused with 403 (server-side allow-list)
$bad = '{"task":"diagnose_patient","state":"chest pain"}'
try {
  $resp = Invoke-WebRequest -Uri "$base/v1/decide" -Method Post -ContentType 'application/json' -Body $bad -TimeoutSec 60 -UseBasicParsing
  Fail "policy not enforced, HTTP $($resp.StatusCode)"
} catch {
  $code = $null; try { $code = [int]$_.Exception.Response.StatusCode } catch {}
  if ($code -eq 403) { Write-Host 'PASS policy: diagnose_patient refused with 403' }
  else { Fail "expected 403 for diagnose_patient, got $code ($_)" }
}

# 4) shutdown
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Write-Host 'PASS shutdown'
Write-Host 'ALL_LAYA_LIVE_TESTS_PASSED'
exit 0
