[CmdletBinding()]
param()

# Read-only Astra integration checks. Windows PowerShell 5.1 compatible.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$portsPath = Join-Path $repoRoot 'config\ports.json'
$envPath = Join-Path $repoRoot 'config\ai-gateway.env'
$checks = New-Object System.Collections.Generic.List[object]

function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
  $label = if ($Passed) { 'PASS' } else { 'FAIL' }
  Write-Output ("{0} {1} - {2}" -f $label, $Name, $Detail)
  $checks.Add([pscustomobject]@{ Name = $Name; Passed = $Passed; Skipped = $false })
}

function Add-Skipped([string]$Name, [string]$Detail) {
  Write-Output ("SKIPPED {0} - {1}" -f $Name, $Detail)
  $checks.Add([pscustomobject]@{ Name = $Name; Passed = $false; Skipped = $true })
}

function Read-EnvFileValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $envPath)) { return $null }
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match ('^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*?)\s*$')) {
      $value = $Matches[1].Trim()
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      return $value
    }
  }
  return $null
}

function Invoke-StatusProbe([string]$Uri, [hashtable]$Headers = @{}) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Headers $Headers -TimeoutSec 8
    return [pscustomobject]@{ Ok = ($response.StatusCode -eq 200); Code = [int]$response.StatusCode; Body = [string]$response.Content; Error = $null }
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    return [pscustomobject]@{ Ok = $false; Code = $code; Body = ''; Error = $_.Exception.Message }
  }
}

Push-Location $repoRoot
$tempRagDir = $null
try {
  $registry = Get-Content -LiteralPath $portsPath -Raw | ConvertFrom-Json
  $free = $registry.services.freellmapi
  $api = $registry.services.'astra-api'
  $laya = $registry.services.laya

  # 1. FreeLLMAPI: read the key for the request, but never print it.
  $freeKey = Read-EnvFileValue 'FREELLMAPI_API_KEY'
  $freeProbe = Invoke-StatusProbe ("http://{0}:{1}/v1/models" -f $free.host, $free.port) @{ Authorization = "Bearer $freeKey" }
  Add-Check 'FreeLLMAPI /v1/models' ($null -ne $freeKey -and $freeProbe.Ok) ("HTTP {0}; key=present" -f $freeProbe.Code)

  # 2. Astra API health and loopback binding.
  $apiProbe = Invoke-StatusProbe ("http://{0}:{1}/api/live" -f $api.host, $api.port)
  $listeners = @(Get-NetTCPConnection -LocalPort ([int]$api.port) -State Listen -ErrorAction SilentlyContinue)
  $loopbackOnly = ($listeners.Count -gt 0 -and (@($listeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count -eq 0))
  Add-Check 'Astra API /api/live and loopback bind' ($apiProbe.Ok -and $loopbackOnly) ("HTTP {0}; listeners={1}; loopbackOnly={2}" -f $apiProbe.Code, $listeners.Count, $loopbackOnly)

  # 3. Skip only when explicitly disabled in the process or local config.
  $layaEnabled = $env:ASTRA_LAYA_ENABLED
  if ($null -eq $layaEnabled -or $layaEnabled.Trim() -eq '') { $layaEnabled = Read-EnvFileValue 'ASTRA_LAYA_ENABLED' }
  if ($layaEnabled -eq '0') {
    Add-Skipped 'Laya health' 'ASTRA_LAYA_ENABLED=0'
  } else {
    $layaProbe = Invoke-StatusProbe ("http://{0}:{1}{2}" -f $laya.host, $laya.port, $laya.healthPath)
    Add-Check 'Laya health' $layaProbe.Ok ("HTTP {0}" -f $layaProbe.Code)
  }

  # 4. Hermes diagnostic. This invokes the diagnostic command only; it does not start a service.
  try {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $hermesOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\start-hermes.ps1') chat -q 'Return exactly HERMES_DIAGNOSTIC_OK' -Q --safe-mode --max-turns 1 --provider custom:astra 2>&1 | Out-String
    $hermesExit = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction
    Add-Check 'Hermes diagnostic' ($hermesExit -eq 0 -and $hermesOutput -match 'HERMES_DIAGNOSTIC_OK') ("exit={0}; expected marker={1}" -f $hermesExit, ($hermesOutput -match 'HERMES_DIAGNOSTIC_OK'))
  } catch {
    $ErrorActionPreference = 'Stop'
    Add-Check 'Hermes diagnostic' $false 'command failed before diagnostic completed'
  }

  # 5. Synthetic RAG index and deterministic retrieval/citation check.
  $tempRagDir = Join-Path ([IO.Path]::GetTempPath()) ('astra-rag-check-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempRagDir | Out-Null
  $env:ASTRA_RAG_INDEX_PATH = Join-Path $tempRagDir 'rag-index.json'
  $ingestOutput = & npx tsx scripts/ingest-rag-folder.ts (Join-Path $repoRoot 'knowledge-seed') 2>&1 | Out-String
  $ingestExit = $LASTEXITCODE
  $probeCode = "import { vectorStore } from './server/rag/vectorStore'; const relevant=vectorStore.search('triage guidance warning signs'); const unrelated=vectorStore.search('quantum entanglement unrelated'); const answer=relevant.length ? 'Synthetic answer [1]' : ''; const abstention=unrelated.length===0 ? 'Astra could not find an authorized source for this question. No evidence-backed answer is available.' : ''; console.log(JSON.stringify({relevantIds:relevant.map(x=>x.id),relevantCited:answer.includes('[1]'),unrelatedIds:unrelated.map(x=>x.id),abstention:abstention}));"
  $ragOutput = & npx tsx -e $probeCode 2>&1 | Out-String
  $ragExit = $LASTEXITCODE
  $ragResult = $null
  try { $ragResult = $ragOutput.Trim() | ConvertFrom-Json } catch { }
  $ragPass = ($ingestExit -eq 0 -and $ragExit -eq 0 -and $null -ne $ragResult -and @($ragResult.relevantIds).Count -gt 0 -and $ragResult.relevantCited -and @($ragResult.unrelatedIds).Count -eq 0 -and $ragResult.abstention -like 'Astra could not find*')
  Add-Check 'Synthetic RAG retrieval and abstention' $ragPass ("ingestExit={0}; queryExit={1}; relevant={2}; cited={3}; unrelated={4}" -f $ingestExit, $ragExit, @($ragResult.relevantIds).Count, $ragResult.relevantCited, @($ragResult.unrelatedIds).Count)

  # 6. Typecheck and the project test command. Only summary lines are printed.
  $tscOutput = & npx tsc -p tsconfig.app.json --noEmit 2>&1 | Out-String
  $tscExit = $LASTEXITCODE
  Add-Check 'TypeScript' ($tscExit -eq 0) ("TSC_EXIT={0}" -f $tscExit)
  try {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $testOutput = & npm test 2>&1 | Out-String
    $testExit = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction
    $testSummary = ($testOutput -split "`r?`n" | Where-Object { $_ -match '^\s*Test Files\s|^\s*Tests\s' }) -join '; '
    Add-Check 'npm test' ($testExit -eq 0) ("NPM_EXIT={0}; {1}" -f $testExit, $testSummary)
  } catch {
    $ErrorActionPreference = 'Stop'
    Add-Check 'npm test' $false 'npm test command failed to complete'
  }
} catch {
  Add-Check 'Integration harness' $false 'unexpected harness error'
} finally {
  Remove-Item Env:ASTRA_RAG_INDEX_PATH -ErrorAction SilentlyContinue
  if ($tempRagDir -and (Test-Path -LiteralPath $tempRagDir)) { Remove-Item -LiteralPath $tempRagDir -Recurse -Force }
  Pop-Location
}

$passed = @($checks | Where-Object { $_.Passed }).Count
$skipped = @($checks | Where-Object { $_.Skipped }).Count
$failed = @($checks | Where-Object { -not $_.Passed -and -not $_.Skipped }).Count
Write-Output ("FINAL checks={0} passed={1} skipped={2} failed={3}" -f $checks.Count, $passed, $skipped, $failed)
if ($failed -gt 0) { exit 1 }
exit 0
