# ASTRA Central Model Gateway & OmniRoute Fallback Architecture

## Overview
ASTRA routes all model interactions through one central gateway layer (`server/ai/modelGateway.ts`).
FreeLLMAPI is the primary OpenAI-compatible provider. If FreeLLMAPI is unreachable, times out, or returns a 5xx/429/408/404 transient error, the gateway automatically retries the identical request through OmniRoute and logs the route that answered (`answeredBy`).

```
Application Caller (Saarathi, Agents, Brain, Internal Browser)
                     │
                     ▼
             Central ModelGateway
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
    [PUBLIC / INTERNAL]   [PHI / HIGH_RISK_CLINICAL]
         │                       │
         ├────────────────┐      ▼
         ▼                ▼  Local Allowlist Only (Ollama / Local LLM)
    FreeLLMAPI (31415)   OmniRoute (20128/5171)   FAIL-CLOSED: LOCAL_MODEL_UNAVAILABLE
     (Primary Route)     (Fallback Takeover)       (NEVER remote; NEVER model "auto")
```

## Configuration Layer
All gateway settings are unified into one environment layer (`config/ai-gateway.env` and process environment):
- `ASTRA_LLM_BASE_URL` (aliases `FREELLMAPI_BASE_URL`, default `http://127.0.0.1:31415/v1`)
- `ASTRA_LLM_API_KEY` (aliases `FREELLMAPI_API_KEY`, single source of truth)
- `ASTRA_LLM_DEFAULT_MODEL` (default `auto`)
- `ASTRA_LLM_LOCAL_MODEL` (e.g. `llama3.2:3b`)
- `ASTRA_LLM_LOCAL_ALLOWLIST` (comma-separated list of approved local models)
- `ASTRA_LLM_TIMEOUT_MS` (default `60000`)
- `ASTRA_LLM_MAX_RETRIES` (exponential backoff retry count, default `2`)
- `OMNIROUTE_BASE_URL` (OmniRoute fallback target, `http://localhost:20128/v1` or `:5171/v1`)
- `OMNIROUTE_API_KEY` (read from the same configuration layer)

## Health Probes
Model gateway instances probe upstream health in this exact order where supported:
1. `GET /api/ping`
2. `GET /readyz`
3. `GET /v1/models?ready=true`
OpenAI-compatible operational calls go strictly through `/v1/*`.

## Resiliency Features
- **Circuit Breaker**: In-process breaker transitions closed → open after 3 consecutive failures. Providers are isolated for a 30s cooldown before half-open probes.
- **Exponential Retry**: Transient failures retry with backoff (`150ms * 2^attempt`, max 2s).
- **Structured Error Types**: `ModelGatewayError` (with error codes and status) and `LocalModelUnavailableError` (`LOCAL_MODEL_UNAVAILABLE`).
- **Telemetry & Correlation**: `ASTRA-YYYYMMDDHHMMSS-XXXXXX` correlation IDs logged on every attempt with latency, route, status, and error details.
- **Model Fallback List**: Optional ordered model list tried in sequence before switching gateways.

## Privacy & Clinical Safety (MANDATORY)
1. **Classification**: Messages with UHID, patient IDs, phone numbers, lab results, prescriptions, or clinical risk are classified as `PHI` or `HIGH_RISK_CLINICAL`.
2. **Local-Only Boundary**: PHI and high-risk queries are locked to explicit allowlisted local models.
3. **Never "auto" for PHI**: The gateway refuses `model: "auto"` for restricted classes.
4. **No Remote Fallback**: If the local model is offline or unconfigured, the gateway **fails closed** with `LOCAL_MODEL_UNAVAILABLE`. Under no circumstances does PHI silently fail over to FreeLLMAPI, OmniRoute, or external cloud providers.
5. **Secret & Patient Hygiene**: Keys and patient content are never echoed to logs, frontend views, or source repositories.
