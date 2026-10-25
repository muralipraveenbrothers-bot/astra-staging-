param(
  [int64]$LatestCommitEpoch = 200,
  [int64]$ProcessStartEpoch = 100,
  [string]$BindAddress = '127.0.0.1',
  [switch]$LauncherOwned,
  [switch]$ConversionError
)

. (Join-Path $PSScriptRoot 'start-all.helpers.ps1')

$owned = @([pscustomobject]@{ name = 'AstraUI'; pid = @(4321, 4322) })
$none = Find-AstraOwnedListener -Entries $owned -Name 'AstraUI' -ListenerPids @()
if ($none) { throw 'no-owned-process scenario failed' }
$one = Find-AstraOwnedListener -Entries $owned -Name 'AstraUI' -ListenerPids @(4322)
if (-not $one) { throw 'one-owned-process scenario failed' }
$many = Find-AstraOwnedListener -Entries $owned -Name 'AstraUI' -ListenerPids @(1001, 4321)
if (-not $many) { throw 'multiple-listener scenario failed' }
$nested = [pscustomobject]@{ value = @([pscustomobject]@{ value = @([pscustomobject]@{ name = 'AstraUI'; pid = 4321 }) }) }
$nestedMatch = Find-AstraOwnedListener -Entries @($nested) -Name 'AstraUI' -ListenerPids @(4321, 4322)
if (-not $nestedMatch) { throw 'nested launcher ownership scenario failed' }
$restarted = @([pscustomobject]@{ name = 'AstraUI'; pid = 5001 })
$recorded = Find-AstraOwnedListener -Entries $restarted -Name 'AstraUI' -ListenerPids @(5001)
if (-not $recorded) { throw 'launcher restart ownership scenario failed' }
'PID_SCENARIOS: no-owned=PASS one-owned=PASS two-listeners=PASS nested-state=PASS vite-restart-owned=PASS'

$reasons = @()
try {
  if ($ConversionError) { throw 'synthetic conversion error' }
  if ($ProcessStartEpoch -lt $LatestCommitEpoch) { $reasons += 'older than latest commit' }
} catch {
  'STALE_CHECK_SKIPPED: conversion error'; exit 0
}
if ($BindAddress -ne '127.0.0.1' -and $BindAddress -ne '::1') { $reasons += "bound to $BindAddress" }
if ($reasons.Count -eq 0) { 'FRESH_API' }
elseif ($LauncherOwned) { "STALE_API restart: $($reasons -join ' and')" }
else { "STALE_API warn-only: $($reasons -join ' and')" }
