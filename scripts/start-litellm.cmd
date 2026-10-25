@echo off
rem LiteLLM proxy — the venv's litellm.exe entry point points at the client CLI
rem (which rejects --port), so launch via litellm:run_server. PYTHONUTF8=1 fixes
rem the Unicode banner crash under cp1252.
cd /d D:\astra PM\modules\litellm
set PYTHONUTF8=1
if not exist "D:\astra PM\logs" mkdir "D:\astra PM\logs"
echo [%date% %time%] Starting LiteLLM proxy on :4000 >> "D:\astra PM\logs\litellm.log"
venv\Scripts\python.exe _start_proxy.py >> "D:\astra PM\logs\litellm.log" 2>&1
echo [%date% %time%] LiteLLM exited %errorlevel% >> "D:\astra PM\logs\litellm.log"
