@echo off
REM ============================================================
REM  Astra AI — native executor setup.
REM  Retired external executor installers are intentionally absent.
REM ============================================================
setlocal
cd /d "D:\astra PM"
if not exist "modules" mkdir "modules"
set "LOGDIR=D:\astra PM\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [OK] Native Astra executor path is used; no external executor is installed.
echo.
echo Hermes and Astra native dispatch use the configured gateway environment.
endlocal
