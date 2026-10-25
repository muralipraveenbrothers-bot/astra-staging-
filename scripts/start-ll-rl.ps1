$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force -Path "D:\astra PM\logs" | Out-Null
$registry = Get-Content (Join-Path $PSScriptRoot "..\config\ports.json") -Raw | ConvertFrom-Json
$free = $registry.services.freellmapi
$freellmBase = "http://$($free.host):$($free.port)/v1"

# LiteLLM needs UTF-8 or the banner crashes under cp1252
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","set PYTHONUTF8=1&& venv\Scripts\python.exe _start_proxy.py >> D:\astra PM\logs\litellm.log 2>&1" -WorkingDirectory "D:\astra PM\modules\litellm" -WindowStyle Minimized

# RouteLLM needs an API key env even when using FreeLLMAPI
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","set OPENAI_API_BASE=$freellmBase&& set OPENAI_API_KEY=dummy&& venv\Scripts\python.exe -m routellm.openai_server --routers random --port 6060 --strong-model freellm --weak-model freellm >> D:\astra PM\logs\routellm.log 2>&1" -WorkingDirectory "D:\astra PM\modules\RouteLLM" -WindowStyle Minimized

Write-Output "relaunched litellm+routellm"
