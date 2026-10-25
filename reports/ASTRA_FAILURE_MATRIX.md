# ASTRA Failure Injection Matrix

Generated during Prompt 09 repair pass. Source of truth: `scripts\verify-astra.ps1` plus focused regressions for the repaired n8n and avatar defects.

| Failure | Injection method | Expected behavior | Result | Evidence |
| --- | --- | --- | --- | --- |
| FreeLLMAPI unavailable | ModelGateway verifier simulates provider failure | OmniRoute/Ollama fallback path remains available | PASS | `ModelGateway: FreeLLMAPI -> OmniRoute -> Ollama failover` |
| One model exhausted | ModelGateway verifier exercises fallback selection | Next eligible model is selected without leaking PHI | PASS | `ModelGateway: Central ModelGateway configuration & fallback` |
| Local PHI model unavailable | RBAC/privacy and ModelGateway verifier paths | PHI stays local; fail closed instead of remote PHI send | PASS | `RBAC/Privacy`, `ModelGateway` |
| Laya timeout | Laya bounded-decision verifier | System degrades with actionable recovery guidance | PASS | `Laya: Bounded System-1 decision nucleus` |
| Hermes failure | Hermes dispatch verifier | Supervisor returns diagnostic failure without breaking core turn | PASS | `Hermes: Hermes cortex supervisory delegation` |
| LangGraph interrupted workflow | LangGraph checkpoint/resume verifier | Workflow state survives interruption and resumes | PASS | `LangGraph: Clinical state machine steps, approval path` |
| Memory/Mem0 unavailable | Memory Fabric verifier | Scoped memory gates degrade without blocking clinical turn | PASS | `Memory Fabric: Scoped memory gates` |
| Voicebox unavailable | Voicebox simulated flow verifier | UI/provider status shows degraded/offline and TTS fallback works | PASS | `Voicebox: provider adapter`, `Voicebox: Audio round-trip delivery` |
| Plugin offline | Plugin action verifier | Plugin state reports offline/degraded honestly | PASS | `Plugins: Plugin manifest validation` |
| Internal Browser service offline | Internal Browser verifier | Service card shows OFFLINE/DEGRADED and actionable route | PASS | `Internal Browser: API-first browser intent routing` |
| n8n unavailable | Health probe against `127.0.0.1:5678` | Required gates pass; optional n8n reports honest warning | WARN | `n8n (:5678): ECONNREFUSED` |
| Malformed EventEnvelope | EventBus verifier | Envelope rejected with contract error; no duplicate side effect | PASS | `EventBus: EventEnvelope validation` |
| Unauthorized R3 action | Tool Registry/RBAC verifier | Action denied by role/risk policy | PASS | `Tool Registry`, `RBAC/Privacy` |

## Verification Summary

- Initial full verifier: PASS with warning only for optional n8n offline (`40 passed / 0 failed / 1 warning`, exit 0).
- Focused n8n regression after repair: `server/tests/n8nBus.spec.ts` passed (`7/7`).
- Focused avatar regressions after repair: `server/routes/avatar.spec.ts` and `server/ws/avatarGateway.spec.ts` passed (`8/8`).
- Final full verifier: see latest `reports/ASTRA_VERIFY.md` and `reports/ASTRA_VERIFY.json`.

## Unresolved Blockers

- n8n is not running on `127.0.0.1:5678`; this is an optional service-health warning, not a required gate failure. Action: start with `start-n8n.cmd` or `npx n8n start` when live workflow automation is needed.
