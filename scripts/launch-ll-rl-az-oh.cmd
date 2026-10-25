@echo off
cd /d "D:\astra PM"
for /f %%P in ('powershell -NoProfile -Command "(Get-Content config/ports.json -Raw | ConvertFrom-Json).services.freellmapi.port"') do set "FREELLM_PORT=%%P"

start "LiteLLM" /min cmd /c "cd /d D:\astra PM\modules\litellm && set PYTHONUTF8=1&& set PYTHONIOENCODING=utf-8&& venv\Scripts\python.exe _start_proxy.py > litellm-run.log 2>&1"

start "RouteLLM" /min cmd /c "cd /d D:\astra PM\modules\RouteLLM && set OPENAI_API_BASE=http://127.0.0.1:%FREELLM_PORT%/v1&& set OPENAI_API_KEY=dummy&& set PYTHONUTF8=1&& venv\Scripts\python.exe -m routellm.openai_server --routers random --port 6060 --strong-model freellm --weak-model freellm > routellm-run.log 2>&1"

start "OpenHands" /min cmd /c "cd /d D:\astra PM && start-openhands.cmd"

echo launched
