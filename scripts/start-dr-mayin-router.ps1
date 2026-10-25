# DR MAYIN — Unified Agent Router Launcher
# =========================================
# Boots the unified Dr Mayin voice pipeline:
#   - Verifies Voicebox, FreeLLMAPI, and approved local Ollama ports
#   - Forces AGENT_IDENTITY=DrMayin across the process tree
#   - Starts the LangGraph router in interactive or server mode
#
# Usage (from D:\astra PM):
#   .\scripts\start-dr-mayin-router.ps1
#   .\scripts\start-dr-mayin-router.ps1 -Mode server

param(
    [string]$Mode = "interactive",
    [string]$Workspace = "doctor",
    [string]$AstraBase = "http://127.0.0.1:3000",
    [int]$VoiceboxPort = 17493,
    [int]$FreeLLMPort  = 0,
)

$ErrorActionPreference = "Continue"
$registryPath = Join-Path $PSScriptRoot "..\config\ports.json"
$registry = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
if ($FreeLLMPort -le 0) { $FreeLLMPort = [int]$registry.services.freellmapi.port }
$Host.UI.RawUI.WindowTitle = "DR MAYIN — Unified Agent Router"

# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  DR MAYIN — Unified AI Orchestrator" -ForegroundColor White
Write-Host "  Saarathi  Sanjeevani  Jarvis  Astra = ONE Identity" -ForegroundColor DarkCyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Set unified identity env vars ─────────────────────────────────────────────
$env:AGENT_IDENTITY        = "DrMayin"
$env:MAYIN_WORKSPACE       = $Workspace
$env:ASTRA_API_BASE        = $AstraBase
$env:FREELLM_BASE_URL      = "http://127.0.0.1:$FreeLLMPort"
$env:OLLAMA_BASE_URL       = "http://127.0.0.1:11434"
$env:VOICEBOX_BASE_URL     = "http://127.0.0.1:$VoiceboxPort"

Write-Host "[Identity] AGENT_IDENTITY = DrMayin (all aliases unified)" -ForegroundColor Green
Write-Host "[Workspace] $Workspace" -ForegroundColor DarkGreen

# ── Port probe helper ─────────────────────────────────────────────────────────
function Test-Port {
    param([string]$Name, [int]$Port)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $ar  = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $ok  = $ar.AsyncWaitHandle.WaitOne(800, $false)
        $tcp.Close()
        if ($ok) {
            Write-Host "  [OK] $Name (:$Port)" -ForegroundColor Green
            return $true
        }
    } catch {}
    Write-Host "  [--] $Name (:$Port) not reachable" -ForegroundColor DarkYellow
    return $false
}

# ── Port status check ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[Services]" -ForegroundColor Cyan
$voicebox = Test-Port "Voicebox TTS/STT" $VoiceboxPort
$freellm  = Test-Port "FreeLLMAPI"       $FreeLLMPort
$ollama   = Test-Port "Ollama"           11434

if (-not $voicebox) {
    Write-Host "  NOTE: Start Voicebox for TTS/STT: start-voicebox.cmd" -ForegroundColor Yellow
}
if (-not $freellm -and -not $ollama) {
    Write-Host "  NOTE: No LLM provider reachable. Dr Mayin will use deterministic fallback." -ForegroundColor Yellow
}

# ── Load Astra server token ───────────────────────────────────────────────────
$tokenFile = "D:\astra PM\.env.local"
if (Test-Path $tokenFile) {
    $lines = Get-Content $tokenFile
    foreach ($line in $lines) {
        if ($line -match "^ASTRA_SERVER_TOKEN=(.+)$") {
            $env:ASTRA_SERVER_TOKEN = $Matches[1].Trim()
            Write-Host "[Auth] Astra server token loaded from .env.local" -ForegroundColor Green
            break
        }
    }
}

# ── Python check ──────────────────────────────────────────────────────────────
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3") {
            $pythonCmd = $cmd
            Write-Host "[Python] $ver" -ForegroundColor Green
            break
        }
    } catch {}
}

if (-not $pythonCmd) {
    Write-Host "[ERROR] Python 3 not found. Install Python 3.10+ and try again." -ForegroundColor Red
    exit 1
}

# ── Dependency check ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[Dependencies] Checking langgraph + httpx..." -ForegroundColor Cyan
$missingDeps = @()
foreach ($pkg in @("langgraph", "httpx")) {
    $check = & $pythonCmd -c "import $pkg" 2>&1
    if ($LASTEXITCODE -ne 0) { $missingDeps += $pkg }
}
if ($missingDeps.Count -gt 0) {
    Write-Host "[Install] Installing missing: $($missingDeps -join ', ')" -ForegroundColor Yellow
    & $pythonCmd -m pip install @missingDeps --quiet
}

# ── Launch ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Launching Dr Mayin Router (Mode: $Mode)" -ForegroundColor White
Write-Host "  Say 'Dr Mayin', 'Mayin', 'Saarathi', 'Sanjeevani'," -ForegroundColor DarkCyan
Write-Host "  'Jarvis', or 'Astra' — all route to Dr Mayin." -ForegroundColor DarkCyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = "D:\astra PM\scripts\dr_mayin_langgraph_router.py"

if ($Mode -eq "server") {
    # Future: expose as HTTP service
    Write-Host "[Server mode] Not yet implemented. Use 'interactive'." -ForegroundColor Yellow
} else {
    & $pythonCmd $scriptPath
}
