@echo off
cd /d D:\astra PM\modules\litellm
set LITELLM_PORT=4000
set LITELLM_CONFIG=config.yaml
echo Starting LiteLLM proxy on port %LITELLM_PORT%...
call .\venv\Scripts\litellm-proxy.exe --port %LITELLM_PORT% --config %LITELLM_CONFIG%
if errorlevel 1 (
    echo LiteLLM failed to start. Check config.yaml
    pause
)
