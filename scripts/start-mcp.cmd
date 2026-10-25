@echo off
REM ============================================================
REM Astra AI - Medical MCP Servers Startup
REM ============================================================
REM HTTP servers (long-running, must be started explicitly):
REM   :7010 medical-mcp   (FDA, WHO, PubMed, RxNorm)
REM   :7016 medcalc-mcp   (medical calculators, FastMCP 2.0)
REM
REM STDIO servers (spawned on-demand by Astra's StdioClientTransport,
REM no separate process needed):
REM   medical-research-suite, dicom-mcp, mcp-slicer
REM ============================================================

SET BASEDIR=D:\Astra pmb\astra-staging\modules

REM --- medical-mcp (HTTP :7010) ---
IF NOT EXIST "%BASEDIR%\medical-mcp\build\index.js" (
  cd /d "%BASEDIR%\medical-mcp" && npm install && npm run build
)
cd /d "%BASEDIR%\medical-mcp"
start "astra-mcp-7010" /min cmd /c "node build/index.js --http --port=7010 > mcp-7010.log 2>&1"

REM --- medcalc-mcp (HTTP :7016) ---
IF NOT EXIST "%BASEDIR%\medcalcmcp\venv\Scripts\python.exe" (
  cd /d "%BASEDIR%\medcalcmcp" && py -3.12 -m venv venv && venv\Scripts\pip.exe install -r requirements.txt
)
cd /d "%BASEDIR%\medcalcmcp"
start "astra-mcp-7016" /min cmd /c "venv\Scripts\python.exe api_server.py > medcalc-7016.log 2>&1"

echo.
echo Medical MCP HTTP servers started: :7010 medical-mcp, :7016 medcalc-mcp
echo STDIO servers (research-suite, dicom, slicer) spawn on-demand via Astra.
echo Verify: curl http://127.0.0.1:3000/api/mcp/servers
