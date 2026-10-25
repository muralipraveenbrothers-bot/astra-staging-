@echo off
rem Auto-connect FreeLLM API using its configured mode (internal | external)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autoconnect-services.ps1" -Only freellm
