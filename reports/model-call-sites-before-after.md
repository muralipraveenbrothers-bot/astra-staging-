# Model Call Sites Migration Report (Prompt 03)

## Summary
Centralized LLM calls through `ModelGateway` (`server/ai/modelGateway.ts`) with automatic OmniRoute failover, circuit breaker protection, ready-model discovery, structured error types, request correlation, and strict local-only PHI boundaries.

## Secret Source & Port Hygiene
- **One Secret Source**: FreeLLMAPI key is read from `config/ai-gateway.env` (`FREELLMAPI_API_KEY`), verified matching the live FreeLLMAPI database key (`freellmapi-116f7442bc75497653bef9371db56abf66ae150437b4e0ab`). `ASTRA_LLM_API_KEY` aliases this key; no second secret introduced.
- **Port 3001 Removal**: Verified absent from `scripts/dr_mayin_langgraph_router.py` and `scripts/start-dr-mayin-router.ps1`. Canonical port `:31415` preserved.

## Call Site Inventory & Migration Map

| Location | Original Mechanism | Post-Migration Architecture | Risk / PHI Treatment | Status |
|---|---|---|---|---|
| `server/ai/gatewayAdapter.ts` (`callAi`) | Direct fetch chain to FreeLLMAPI -> OmniRoute -> Ollama | Wrapped / backed by `ModelGateway` and `aiGatewayConfig`. Continues serving `/v1/chat/completions` adapter. | Honors `classifyData` and PHI guard | Active & Passing |
| `server/routes/jarvis.ts` (`/api/astra-clinical-ai`, `/api/jarvis/chat`) | Optional direct Groq fetch -> fallback to `astraOrchestrator` | Preserves local intent brain first (0 tokens), Groq optional fast-path for non-clinical chat, falls back to orchestrator -> Central ModelGateway. | Patient context routed safely; degraded mode when offline | Active & Preserved |
| `server/routes/astra-voice.ts` | Groq direct call -> Ollama direct call -> static intent replies | Voice guardian intent evaluated first. Safe queries can use model gateway; clinical queries bound to tools or local fallback. | Voice Guardian blocks unsafe prompt injections; PHI never leaves local | Active & Preserved |
| `src/astra/agents/orchestrator.ts` | Direct Gemini generateContent fetch | Scheduled for brain wiring (Prompt 04). Client agent preserves existing Co-Pilot flow until brain unification. | PHI stays on local Ollama path | Preserved for Prompt 04 |
| `src/astra/agents/hermes.ts`, `ecgAgent.ts`, `paperclip.ts` | Direct Gemini REST calls | Wire through Central AI Adapter (`http://127.0.0.1:3000/v1`) using adapter key. | No direct external PHI transmission | Identified for Prompt 04/05 |

## Verified Verification Evidence
- `server/ai/modelGateway.spec.ts`: 9 tests passing.
  - Unified env layer reading (`ASTRA_LLM_*` + `OMNIROUTE_*`).
  - Health probe order: `/api/ping` -> `/readyz` -> `/v1/models?ready=true`.
  - Primary FreeLLMAPI routing with `answeredBy: "freellmapi"`.
  - OmniRoute takeover test on FreeLLMAPI failure with `answeredBy: "omniroute"`.
  - Fail-closed PHI protection: `LOCAL_MODEL_UNAVAILABLE` triggered, remote fallback refused.
  - PHI rejects model `auto`.
  - PHI restricted to local allowlist.
  - Clean PHI routes to local engine without remote fetch.
- `server/astra/supervisor/stack-contract.spec.ts`: 27/27 passing (single secret source, port 3001 firewalled, zero leaked keys).
- `server/ai/gateway.spec.ts`, `circuitBreaker.spec.ts`, `intelligenceExtensions.spec.ts`: All passing.
