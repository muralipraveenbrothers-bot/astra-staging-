@echo off
cd /d D:\Astra pmb\astra-staging\modules\RouteLLM
for /f %%P in ('powershell -NoProfile -Command "(Get-Content ..\..\config\ports.json -Raw | ConvertFrom-Json).services.freellmapi.port"') do set "FREELLM_PORT=%%P"
for /f %%H in ('powershell -NoProfile -Command "(Get-Content ..\..\config\ports.json -Raw | ConvertFrom-Json).services.freellmapi.host"') do set "FREELLM_HOST=%%H"
set OPENAI_API_BASE=http://%FREELLM_HOST%:%FREELLM_PORT%/v1
set OPENAI_API_KEY=dummy
if not exist "D:\Astra pmb\astra-staging\logs" mkdir "D:\Astra pmb\astra-staging\logs"
echo [%date% %time%] Starting RouteLLM on :6060 >> "D:\Astra pmb\astra-staging\logs\routellm.log"
.\venv312\Scripts\python.exe -m routellm.openai_server --routers random --port 6060 --strong-model freellm --weak-model freellm >> "D:\Astra pmb\astra-staging\logs\routellm.log" 2>&1
echo [%date% %time%] RouteLLM exited %errorlevel% >> "D:\Astra pmb\astra-staging\logs\routellm.log"
