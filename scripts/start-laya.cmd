@echo off
setlocal
cd /d "%~dp0.."
if not exist logs mkdir logs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\laya-supervisor.ps1"
exit /b %errorlevel%
