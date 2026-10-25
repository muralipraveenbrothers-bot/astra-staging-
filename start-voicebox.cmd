@echo off
REM Official Voicebox (jamiepine/voicebox — https://github.com/jamiepine/voicebox)
REM Local API default: http://127.0.0.1:17493
setlocal
set "VBEXE=%LOCALAPPDATA%\voicebox\voicebox-server.exe"
if not exist "%VBEXE%" set "VBEXE=%LOCALAPPDATA%\Voicebox\voicebox-server.exe"
if not exist "%VBEXE%" (
  echo Voicebox server not found. Install from https://github.com/jamiepine/voicebox
  exit /b 1
)
echo Voicebox server starting on http://127.0.0.1:17493
"%VBEXE%" --host 127.0.0.1 --port 17493
echo Voicebox server exited with code %errorlevel%
