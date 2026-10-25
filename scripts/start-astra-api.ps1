$ErrorActionPreference = 'Stop'
$astraRoot = Split-Path $PSScriptRoot -Parent
if (3000 -in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port) {
  Write-Output 'Astra API already running on :3000.'
  exit 0
}
Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c ""' + (Join-Path $astraRoot 'start-astra-api.cmd') + '""') -WorkingDirectory $astraRoot -WindowStyle Hidden
