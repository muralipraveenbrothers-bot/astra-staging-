$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force -Path "D:\astra PM\logs" | Out-Null

# LiteLLM :4000
Start-Process -FilePath "D:\astra PM\modules\litellm\venv\Scripts\python.exe" `
  -ArgumentList "_start_proxy.py" `
  -WorkingDirectory "D:\astra PM\modules\litellm" `
  -WindowStyle Minimized `
  -RedirectStandardOutput "D:\astra PM\logs\litellm.out.log" `
  -RedirectStandardError "D:\astra PM\logs\litellm.err.log"

# RouteLLM :6060
Start-Process -FilePath "D:\astra PM\modules\RouteLLM\venv\Scripts\python.exe" `
  -ArgumentList "-m","routellm.openai_server","--routers","random","--port","6060","--strong-model","freellm","--weak-model","freellm" `
  -WorkingDirectory "D:\astra PM\modules\RouteLLM" `
  -WindowStyle Minimized `
  -RedirectStandardOutput "D:\astra PM\logs\routellm.out.log" `
  -RedirectStandardError "D:\astra PM\logs\routellm.err.log"

# Agent Zero :5000
Start-Process -FilePath "D:\astra PM\modules\agentzero\venv\Scripts\python.exe" `
  -ArgumentList "run_ui.py" `
  -WorkingDirectory "D:\astra PM\modules\agentzero" `
  -WindowStyle Minimized `
  -RedirectStandardOutput "D:\astra PM\logs\agentzero.out.log" `
  -RedirectStandardError "D:\astra PM\logs\agentzero.err.log"

# OpenHands UI:8080 API:18000
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c","start-openhands.cmd" `
  -WorkingDirectory "D:\astra PM" `
  -WindowStyle Minimized

Write-Output "launched LiteLLM RouteLLM AgentZero OpenHands"
