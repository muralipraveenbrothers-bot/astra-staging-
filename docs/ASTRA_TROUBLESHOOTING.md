# ASTRA Troubleshooting & Remediation Guide

This guide provides operational runbooks and fixes for common failures across the ASTRA platform.
All services, ports, and boundaries follow `config/ports.json` and `config/ai-gateway.env`.

---

## Quick Reference: Service Port Matrix

| Service | Port | Tier | Health Check | Launcher |
|---|---|---|---|---|
| **Astra API** | `3000` | Core | `http://127.0.0.1:3000/api/health` | `start-astra-api.cmd` |
| **Astra UI** | `5173` | Core | `http://127.0.0.1:5173` | `start-astra-vite.cmd` |
| **FreeLLMAPI** | `31415` | AI | `http://127.0.0.1:31415/v1/models` | `start-freellmapi-server.cmd` |
| **OmniRoute** | `20128` | AI | `http://127.0.0.1:20128/v1/models` | `scripts/start-omniroute-external.cmd` |
| **Ollama** | `11434` | AI | `http://127.0.0.1:11434/api/tags` | `ollama serve` |
| **Laya** | `8791` | AI | `http://127.0.0.1:8791/v1/health` | `python server/plugins/astra_laya_server.py` |
| **Voicebox** | `17493` | Extension | TCP `127.0.0.1:17493` | `scripts/start-voicebox-server.ps1` |
| **Hermes** | `9119` | Extension | `http://127.0.0.1:9119` | `start-hermes.cmd` |
| **n8n** | `5678` | Extension | `http://127.0.0.1:5678/healthz` | `start-n8n.cmd` |

---

## 1. Port Unavailable / Address In Use (`EADDRINUSE`)

### Symptoms
- Service fails on startup with `Error: listen EADDRINUSE: address already in use :::3000` (or `5173`, `31415`).
- Multiple orphan processes occupy the port after a crash.

### Exact Fix
1. Find the owning PID for the conflicted port:
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess
   ```
2. Inspect and terminate the process:
   ```powershell
   Stop-Process -Id <PID> -Force
   ```
3. Restart through PM2:
   ```powershell
   pm2 restart AstraAPI
   ```

---

## 2. Service Offline

### Symptoms
- Health probe reports `connection refused` or `ECONNREFUSED` on a core or extension port.
- Verification status shows `DOWN`.

### Exact Fix
1. Check PM2 status:
   ```powershell
   pm2 list
   pm2 restart <ProcessName>
   ```
2. Standalone launch commands:
   - **Ollama**: Run `ollama serve`
   - **OmniRoute**: Run `scripts\start-omniroute-external.cmd`
   - **n8n**: Run `start-n8n.cmd`
   - **Laya Nucleus**: Run `python server/plugins/astra_laya_server.py --port 8791`

---

## 3. FreeLLMAPI Unauthorized (`401` / `403`)

### Symptoms
- Gateway returns `HTTP 401 Unauthorized` or `Invalid API key` when querying `127.0.0.1:31415`.

### Exact Fix
1. Ensure keys in `config/ai-gateway.env` match:
   ```env
   ASTRA_LLM_API_KEY=freellmapi-live-master-key
   FREELLMAPI_API_KEY=freellmapi-live-master-key
   ```
2. Restart FreeLLMAPI:
   ```powershell
   pm2 restart FreeLLMAPI
   ```
3. Verify upstream models:
   ```powershell
   curl.exe -s http://127.0.0.1:31415/v1/models -H "Authorization: Bearer freellmapi-live-master-key"
   ```

---

## 4. No Ready Model

### Symptoms
- Model endpoint returns empty model list or `503 No models ready`.
- ModelGateway returns `NO_READY_MODEL`.

### Exact Fix
1. Check model availability on providers:
   ```powershell
   curl.exe -s http://127.0.0.1:31415/v1/models
   curl.exe -s http://127.0.0.1:11434/api/tags
   ```
2. Pull required local model in Ollama:
   ```powershell
   ollama pull llama3.2:3b
   ```
3. Check default fallback list in `config/ai-gateway.env`:
   ```env
   ASTRA_LLM_DEFAULT_MODEL=auto
   ASTRA_LLM_FALLBACK_MODELS=llama3.2:3b,mistral:7b
   ```

---

## 5. OmniRoute Fallback Failed

### Symptoms
- Central ModelGateway fails to complete request when FreeLLMAPI is down.
- Logs report `OmniRoute takeover failed: ECONNREFUSED 127.0.0.1:20128`.

### Exact Fix
1. Verify OmniRoute port configuration in `config/ports.json`:
   - Port is canonical `20128` (legacy alias `5171`).
2. Test OmniRoute connectivity:
   ```powershell
   Test-NetConnection -ComputerName 127.0.0.1 -Port 20128
   ```
3. If port is closed, start OmniRoute:
   ```powershell
   & "scripts\start-omniroute-external.cmd"
   ```
4. Confirm `OMNIROUTE_BASE_URL` in `config/ai-gateway.env`:
   ```env
   OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1
   ```

---

## 6. PHI Local Model Unavailable (`LOCAL_MODEL_UNAVAILABLE`)

### Symptoms
- Gateway throws `LocalModelUnavailableError: LOCAL_MODEL_UNAVAILABLE`.
- Request carrying PHI (UHID, patient identifiers, clinical risk) fails to complete.

### Safety Rule
ASTRA operates under a **FAIL-CLOSED** privacy constraint. Queries classified as `PHI` or `HIGH_RISK_CLINICAL` are **strictly prohibited** from routing to cloud or remote gateways. They must execute on local models (e.g. Ollama).

### Exact Fix
1. Verify that the local LLM runtime (Ollama) is active:
   ```powershell
   curl.exe -s http://127.0.0.1:11434/api/tags
   ```
2. Ensure an approved local model is installed:
   ```powershell
   ollama pull llama3.2:3b
   ```
3. Check `config/ai-gateway.env` allowlist:
   ```env
   ASTRA_LLM_LOCAL_MODEL=llama3.2:3b
   ASTRA_LLM_LOCAL_ALLOWLIST=llama3.2:3b,llama3.1:8b,qwen2.5:3b
   ```
4. Never set `model: "auto"` for PHI requests. Explicitly specify the local model or allow the gateway to default to `ASTRA_LLM_LOCAL_MODEL`.

---

## 7. DB Migration Issue / Corrupted JSON Hospital Store

### Symptoms
- API startup error: `SyntaxError: Unexpected token in JSON at position ...` reading `data/hospital.json`.
- Missing tables or keys in `data/hospital.json` causing 500 responses on `/api/patients` or `/api/hospital`.

### Exact Fix
1. Check for temporary atomic write artifacts:
   ```powershell
   Get-ChildItem -Path "data" -Filter "hospital.json*"
   ```
2. Validate JSON syntax:
   ```powershell
   node -e "JSON.parse(require('fs').readFileSync('data/hospital.json', 'utf8')); console.log('JSON VALID');"
   ```
3. If corrupted, restore from the latest automatic snapshot or backup:
   ```powershell
   Copy-Item "data\hospital.json.tmp.*" "data\hospital.json" -Force
   # Or restore from backups:
   Get-ChildItem -Path "backups" -Filter "*hospital*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   ```
4. Verify required root keys exist: `patients`, `departments`, `rooms`, `doctors`, `census`.

---

## 8. Mem0 / Memory Fabric Unavailable

### Symptoms
- Logs report `Mem0 degraded / not installed`.
- Memory queries fail or fall back to read-only local store.

### Architectural Note
The Astra `memoryFabric` seam (`src/astra/brain/part5/memoryFabric.ts`) abstracts backing engines. When Mem0, MemGraph, pgvector, or Qdrant are not installed, the fabric reports them as `degraded` and uses the structured in-process hospital memory store (`src/astra/brain/part5/memory.ts`).

### Exact Fix
1. Inspect memory fabric status:
   ```powershell
   curl.exe -s http://127.0.0.1:3000/api/memory/status
   ```
2. Verify in-process memory store is operational:
   - Ensure `data/hospital.json` is writeable.
   - Check that `patientId` is supplied on all recall/store operations (isolated by MRN/UHID).
3. If external Mem0 service is enabled in environment:
   - Verify `MEM0_API_KEY` or `MEM0_BASE_URL` in `.env.local`.
   - If not in use, ensure `memoryFabric.status()` reports `hospitalDatabase: "operational"`.


---

## 9. Voicebox Unavailable (`:17493`)

### Symptoms
- TTS or audio streaming fails; client reports `Voicebox unreachable`.
- Port 17493 connection refused.

### Exact Fix
1. Check PM2 Voicebox status:
   ```powershell
   pm2 describe Voicebox
   pm2 logs Voicebox --lines 30 --nostream
   ```
2. If process died, restart:
   ```powershell
   pm2 restart Voicebox
   ```
3. If running standalone:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-voicebox-server.ps1
   ```
4. Fallback Verification:
   The voice system automatically falls back from Voicebox local neural TTS -> Cloud Voice -> Browser Web Speech API (`SpeechSynthesis`). If Voicebox is down, the frontend switches cleanly without failing user interaction.

---

## 10. Browser Embed Blocked (X-Frame-Options / CSP)

### Symptoms
- Internal Browser iframe displays blank screen or console error:
  `Refused to display '...' in a frame because it set 'X-Frame-Options' to 'sameorigin'` or `CSP frame-ancestors`.

### Exact Fix
1. Use the Vite Embed Proxy:
   - Astra provides `vite.embed-proxy.ts` on Vite port `5173` to strip frame restriction headers from approved loopback services (Hermes, n8n, Paperclip, OpenHands).
2. For internal service navigation:
   - Open through the registered proxy route `/proxy/<service>/` or configured embed URL rather than direct URL.
3. Check Service Registry permissions:
   - Inspect `src/astra/events/astraEventBus.ts` `listInternalServices()`.
   - Ensure the service has `embedSupported: true` and appropriate permissions.

---

## 11. Schema Mismatch (EventBus / Tool Registry)

### Symptoms
- Event publish rejected: `Error: Event envelope schema validation failed`.
- Tool execution error: `Error: Invalid tool input schema`.

### Exact Fix
1. Ensure all events conform to `AstraEventEnvelope`:
   - Required fields: `eventId`, `correlationId`, `timestamp`, `source`, `target`, `eventType`, `actorId`, `actorRole`, `privacyClass`, `riskClass`, `payload`, `schemaVersion: 1`.
2. Check risk classes:
   - `R0`: Read-only (auto-executed).
   - `R1`: Draft / suggestion.
   - `R2`: Reversible write (requires authorization).
   - `R3`: Consequential write (requires doctor approval).
   - `R4`: Critical life-safety / clinical decision (strict human sign-off).
3. Validate Tool Registry contract:
   - Confirm parameters validate against the tool's JSON schema in `listAstraTools()`.

---

## 12. Test Timeout (`testTimeout` exceeded)

### Symptoms
- Vitest or QA harness test fails with `Error: Test timed out in 20000ms`.
- Probe script hangs on unreachable network connection.

### Exact Fix
1. Increase timeout for long integration tests:
   - In `vitest.config.ts`, `testTimeout` is set to `20000` (20s). For E2E or full-suite runs, pass `--test-timeout=45000`.
2. Check for hung network socket in TCP/HTTP probes:
   - Ensure all `fetch()` calls specify `{ signal: AbortSignal.timeout(timeoutMs) }`.
   - Ensure all `net.connect()` sockets configure `socket.setTimeout(timeoutMs)`.
3. Check for hanging background processes:
   - Clean up unhandled child processes or open WebSocket connections in `afterAll()` hooks.
   - Run verification with `--category=<cat>` to isolate the failing category.

---

## Operational Verification Command

To run the complete automated QA harness across all 18 categories:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-astra.ps1
```
Or via npm:
```powershell
npm run astra
```
Outputs:
- Console table: `MODULE | TEST | STATUS | LATENCY | ERROR | FIX`
- Machine report: `reports/ASTRA_VERIFY.json`
- Human report: `reports/ASTRA_VERIFY.md`

