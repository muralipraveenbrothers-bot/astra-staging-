@echo off
rem Auto-connect the EXTERNAL OmniRoute installation (mode-aware, config-driven)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autoconnect-services.ps1" -Only omniroute
