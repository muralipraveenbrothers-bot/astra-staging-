<#
.SYNOPSIS
    ASTRA Automated QA Harness — Unified Verification Runner (Prompt 07)
.DESCRIPTION
    Runs all 18 QA test categories, outputs the summary table, generates reports,
    and returns exit code 0 only if all required gates pass.
.EXAMPLE
    .\scripts\verify-astra.ps1
    .\scripts\verify-astra.ps1 --fast
    .\scripts\verify-astra.ps1 --category=3
#>

param(
    [switch]$Fast,
    [switch]$NoBrowser,
    [string]$Category = "",
    [switch]$Json,
    [switch]$TableOnly
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir

Set-Location $RootDir

$nodeArgs = @("$ScriptDir\verify-astra.mjs")

if ($Fast) { $nodeArgs += "--fast" }
if ($NoBrowser) { $nodeArgs += "--no-browser" }
if ($Category -ne "") { $nodeArgs += "--category=$Category" }
if ($Json) { $nodeArgs += "--json" }
if ($TableOnly) { $nodeArgs += "--table-only" }

& node $nodeArgs
exit $LASTEXITCODE
