$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$module = Join-Path $root "modules\medical-mcp"
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
if (7010 -in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port) { exit 0 }
$node = "C:\Users\mural\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) { $node = "node.exe" }
Start-Process -FilePath $node -ArgumentList @("build/index.js", "--http", "--port=7010") -WorkingDirectory $module -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "mcp-medical-out.log") -RedirectStandardError (Join-Path $logDir "mcp-medical-err.log")
