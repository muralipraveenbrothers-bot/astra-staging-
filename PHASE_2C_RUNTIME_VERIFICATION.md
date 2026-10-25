# ASTRA AI — PHASE 2C: PRE-WIRING REMEDIATION + RUNTIME VERIFICATION REPORT

Date: 2026-08-31
Scope: Post-Phase-2B remediation only. Verify real services, fix the honest status
surface, add missing Open External access, update tests, and STOP before any wiring.

---
## 0. VERIFIED RUNTIME STATE (measured, not assumed)

| Service | Port | LISTENING? | Status |
|---|---|---|---|
| Astra frontend (Vite) | 5173 | YES (PID 60508) | RUNNING |
| Astra API backend (Express) | 3000 | Started for verification | RUNNING |
| FreeLLMAPI | 3001 | YES (PID 111464) | RUNNING — untouched |
| Ollama | 11434 | YES (PID 88880) | RUNNING |
| OmniRoute | 5171 | NO (proxy sees ECONNREFUSED) | STOPPED — port preserved |
| Paperclip | 3100 | NO | STOPPED — port preserved |
| n8n | 5678 | NO | STOPPED — port preserved / VITE_N8N_BASE set |

FreeLLMAPI and OmniRoute implementations, ports and startup behavior were NOT changed.
No port was invented. No service was reinstalled. No model/system configuration was changed.

---
## 1. CENTRAL SERVICE MAP

- `src/services/astraServices.ts` — single authoritative registry (ports preserved; verified
  against `vite.config.ts` /proxy/* targets and `server/services/serviceDefs.ts`).
- `src/services/gatewayManager.ts` — FreeLLMAPI(3001) primary + OmniRoute(5171) fallback.
- `vite.config.ts` — same-origin /proxy/* to 3001, 11434, 5171, 4000, 6060, 3100, 17493, 5678, 3000.

### Paperclip
- CONFIGURED URL `http://127.0.0.1:3100/` — PRESERVED. A /proxy/paperclip -> 3100 proxy exists.
- Not currently listening. Previously seen HTTP 500; today the port is free (would be connection
  refused, i.e. OFFLINE, not 500). `start-astra.cmd` does NOT start Paperclip (separate install).
  Port/URL kept; no fake dashboard created.

### n8n
- CONFIGURED URL `http://127.0.0.1:5678/` — PRESERVED. /proxy/n8n -> 5678 exists (n8n@2.8.4).
- `VITE_N8N_BASE=http://127.0.0.1:5678` is already set in `.env.local` (verified contents). The
  plugin (`src/astra/runtime/pluginRuntime.ts`) reads `import.meta.env.VITE_N8N_BASE` and now reports
  ACTIVE/HEALTHY — the "Needs VITE_N8N_BASE in .env" state is resolved by the existing environment file.
  No hard-coding was added to React code. Port preserved; service currently not listening.

### Hermes
- VERIFIED REAL -> NousResearch/hermes-agent v0.18.2, commit 05b5e2b6, Python 3.11.15.
- config.yaml present at `C:\Users\mural\AppData\Local\hermes` (this machine's HERMES_HOME).
- Model `qwen3:14b`, provider custom, base `http://127.0.0.1:11434/v1`; context **40,960 < 64,000** min.
- Execution status: **CONFIGURATION_REQUIRED** (honest). No model changed. No fake HTTP server.

### LangGraph
- Honest label: **ASTRA CUSTOM ORCHESTRATOR** (official `@langchain/langgraph` absent).
- Not misrepresented as REAL LANGGRAPH.

### Ollama / OpenClaw / Manus
- Ollama (11434) running, used by Hermes — untouched.
---
## 2. PHASE 2C CHANGES

1. `server/agents/hermesAdapter.ts` — truthful Hermes model/config surface.
   - Corrected config detection to the real HERMES_HOME (`AppData/Local/hermes/config.yaml`),
     replacing the incorrect `~/.hermes` check (which never exists on this Windows install).
   - New `hermesConfig()` reads `config.yaml` + `context_length_cache.yaml` (never modifies them):
     model, provider, baseUrl, contextLength, requiredContext=64000, compatible.
   - `hermesHealth()` now returns `CONFIGURATION_REQUIRED` with a clear, evidence-based message when
     the configured model's context < 64K (the exact Phase-2B verified runtime failure), instead of a
     generic ERROR. Detects the context-window error from real stderr/stdout when present.
   - `hermesCapabilities()` returns `home`, `configPresent`, and `modelConfig`.
2. `src/sections/browser/AstraInternalBrowser.tsx`
   - Hermes console: **CONFIGURATION REQUIRED** banner showing current model / context vs the 64K
     minimum, from real health payload — no fabrication. New fact rows: Current model, Provider/base
     URL, Model context, Config (HERMES_HOME). Added **[Open External]** -> real Astra-origin deep link
     `origin#/browser?service=hermes`.
   - LangGraph console: added **[Open External]** -> `origin#/browser?service=langgraph-orchestrator`.
   - All Open External links use `externalServiceUrl()` (no invented localhost:/hermes URL).
3. `phase2-browser-test.mjs` — removed the obsolete Phase-2B assertion that Hermes has NO Open External
   button; replaced with a positive assertion that the Hermes console has Open External -> correct
   Astra-origin `#/browser?service=hermes` route. Widened a debug slice so the 0.18.2/
   CONFIGURATION_REQUIRED body assertion checks the real values.

---
## 3. VERIFICATION (live, run against the running stack)

- `npx tsc --noEmit` -> PASS (0 errors). `npx tsc -b` -> PASS (0 errors).
- Direct adapter execution (`tsx`): `hermesConfig()` = {model qwen3:14b, contextLength 40960,
  requiredContext 64000, compatible false}; `hermesHealth()` = CONFIGURATION_REQUIRED, version 0.18.2.
- HTTP: `GET /api/agents/hermes/status` and `/health` -> 200, JSON, truthful CONFIGURATION_REQUIRED body.
- `node phase2-browser-test.mjs` (Playwright/Chrome) — PASS for browser home, Hermes card CLI RUNTIME,
  Hermes console opens, Hermes no-fake-iframe, Hermes **Open External present**,
  Hermes **Open External -> `http://localhost:5173/#/browser?service=hermes`**,
  Hermes /api JSON, Hermes 0.18.2/CONFIGURATION_REQUIRED, LangGraph console opens.
  FAIL (environmental only): Paperclip/n8n badge LIVE + 3100/5678 iframe + external — because those
  services are NOT running now; when started their URLs are preserved and opened by Astra unchanged.

---
## 4. SECURITY

- No CSP/CORS/X-Frame-Options/auth/iframe security weakened. External links are explicit
  (`window.open(..., "noopener,noreferrer")`), carry no secrets, and for Hermes/LangGraph resolve to
  the real Astra-origin console route (no invented localhost ports, no fake HTTP servers).

---
## 5. REMAINING CONFIGURATION (for the user)

- **Hermes**: CONFIGURATION REQUIRED — current `qwen3:14b` context = 40,960; Hermes minimum = 64,000.
  Not changed automatically. Choose a model/context >= 64K in `...\Local\hermes\config.yaml`.
- **Paperclip / n8n**: start their real services on 3100 / 5678 (separate installs; not launched by
  `start-astra.cmd`). Astra URLs/VITE_N8N_BASE are already correct and preserved.

## 6. PROVENANCE (final)

- Hermes = **VERIFIED REAL** (NousResearch/hermes-agent v0.18.2) — CONFIGURATION_REQUIRED.
- LangGraph = **ASTRA CUSTOM ORCHESTRATOR** (not official).
- Paperclip/n8n = REAL installations referenced at preserved ports; currently not listening.

## 7. NEXT PHASE — STOPPED

Service/access verification complete. Agent-to-agent wiring has NOT been started.
- OpenClaw: honestly registered NOT INSTALLED. Manus: EXTERNAL / not configured — not fabricated.