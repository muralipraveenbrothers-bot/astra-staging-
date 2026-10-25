$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$module = Join-Path $root "modules\medcalcmcp"
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
if (7016 -in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port) { exit 0 }
$python = "C:\Users\mural\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (-not (Test-Path $python)) { throw "A working Python 3.12 runtime is required for MedCalc MCP" }
Start-Process -FilePath $python -ArgumentList @("astra_bootstrap.py") -WorkingDirectory $module -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "mcp-medcalc-out.log") -RedirectStandardError (Join-Path $logDir "mcp-medcalc-err.log")
