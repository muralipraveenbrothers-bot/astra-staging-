# ASTRA Verification Report

**Execution Date:** 2026-10-14T12:53:31.586Z  
**Overall Result:** PASSED (Exit 0)  
**Duration:** 120625ms  
**Total Tests:** 41 | **Passed:** 40 | **Failed:** 0 | **Warnings:** 1 | **Skipped:** 0

## Results by Module

| MODULE | TEST | STATUS | LATENCY | ERROR | FIX |
|---|---|---|---|---|---|
| Config | ports.json schema & canonical port registry | PASS | 1ms | - | Check config/ports.json for valid JSON and required services (astra-api, freellmapi, omniroute, ollama) |
| Config | ai-gateway.env presence & canonical settings | PASS | 1ms | - | Ensure config/ai-gateway.env exists with ASTRA_LLM_BASE_URL and key definitions |
| Config | package.json integrity & 'astra' script definition | PASS | 0ms | - | Add 'astra' package script pointing to scripts/verify-astra.ps1 in package.json |
| CircuitBreaker | AI Circuit Breaker state transitions & cooldown | PASS | 5339ms | - | Inspect server/ai/circuitBreaker.ts logic |
| PatientContext | Patient context boundary & allergy/vitals models | PASS | 4021ms | - | Inspect server/patient/patientContext.ts |
| MayinMath | Mayin gesture vector math & spatial transforms | PASS | 4156ms | - | Inspect src/features/mayin/gesture/mayinGestureMath.ts |
| API (:3000) | Astra Core API HTTP liveliness & health endpoint | PASS | 357ms | - | pm2 restart AstraAPI OR start-astra-api.cmd |
| UI (:5173) | Astra Vite frontend dev/preview server liveliness | PASS | 486ms | - | pm2 restart AstraUI OR start-astra-vite.cmd |
| JSON hospital store | data/hospital.json integrity & readable schema | PASS | 1ms | - | Check data/hospital.json syntax or restore from backups/ (see docs/ASTRA_TROUBLESHOOTING.md #7) |
| Saarathi | Saarathi conversational engine & command route | PASS | 4ms | - | Restart Astra API (pm2 restart AstraAPI) |
| Voicebox (:17493) | Voicebox local neural TTS/STT TCP socket liveliness | PASS | 2ms | - | pm2 restart Voicebox OR scripts/start-voicebox-server.ps1 |
| FreeLLMAPI (:31415) | FreeLLMAPI primary OpenAI-compatible model route | PASS | 6ms | - | pm2 restart FreeLLMAPI OR start-freellmapi-server.cmd |
| OmniRoute (:20128) | OmniRoute fallback model gateway liveliness | PASS | 9ms | - | scripts/start-omniroute-external.cmd |
| Ollama (:11434) | Ollama local inference runtime tags endpoint | PASS | 6ms | - | Start Ollama desktop app or run 'ollama serve' |
| Laya (:8791) | Laya System-1 fast decision nucleus API | PASS | 10ms | - | python server/plugins/astra_laya_server.py --port 8791 |
| D1-D7 | Astra 7D clinical dimensions engine health | PASS | 4477ms | - | Inspect src/features/mayin/clinical/D7Workflow.ts |
| Scientist | Evidence Scientist & NCBI PubMed client contract | PASS | 9387ms | - | Inspect server/medical/ncbiClient.ts and server/brain/specialists.ts |
| Internal Browser | Internal Browser intent routing & service parser | PASS | 3855ms | - | Inspect src/astra/brain/part4/browser.ts |
| EventBus | AstraEventBus pub/sub & flight recorder correlation | PASS | 3276ms | - | Inspect src/astra/events/astraEventBus.ts |
| ModelGateway | Central ModelGateway configuration & fallback health | PASS | 3541ms | - | Inspect server/ai/modelGateway.ts |
| Tool/Service Registry | Tool & service registry schemas, risk classes & roles | PASS | 3464ms | - | Inspect server/toolRegistryContracts.ts |
| Memory Fabric | Memory Fabric multi-tier scope & persistence seam | PASS | 3603ms | - | Inspect src/astra/brain/part5/memoryFabric.ts |
| Flight Recorder | Flight Recorder span recording, latency & secret scrubbing | PASS | 3053ms | - | Inspect src/astra/brain/part5/trace.ts |
| n8n (:5678) | n8n workflow automation engine healthz endpoint | WARN | 13ms | ECONNREFUSED: fetch failed | start-n8n.cmd OR npx n8n start (optional extension) |
| ModelGateway | FreeLLMAPI -> OmniRoute -> Ollama failover & PHI local model lock | PASS | 4214ms | - | Inspect server/ai/modelGateway.ts and fallback handling |
| EventBus | AstraEventEnvelope validation, correlationId propagation & pub/sub | PASS | 2938ms | - | Inspect src/astra/events/astraEventBus.ts |
| Tool Registry | Role-based tool authorization & R2/R3/R4 human approval gates | PASS | 3634ms | - | Inspect server/toolRegistryContracts.ts and server/brain/toolRegistry.ts |
| Laya | Bounded System-1 decision nucleus & low-confidence fallback | PASS | 3000ms | - | Inspect src/astra/plugins/layaDecision.ts |
| Hermes | Hermes cortex supervisory delegation & diagnostic restraint | PASS | 4235ms | - | Inspect server/brain/hermesCortex.ts |
| LangGraph | Clinical state machine steps, approval pause & resume | PASS | 4170ms | - | Inspect server/brain/langGraphMaster.ts |
| D1-D7 | Synthetic radicular pain clinical evaluation across D1-D7 | PASS | 5146ms | - | Inspect src/features/mayin/clinical/D7Workflow.ts |
| Memory Fabric | Scoped memory gates, recall/store verdicts & patient isolation | PASS | 3037ms | - | Inspect src/astra/brain/part5/memoryFabric.ts and memory.ts |
| Internal Browser | API-first browser intent routing & external AI sanitization | PASS | 3179ms | - | Inspect src/astra/brain/part4/browser.ts |
| Plugins | Plugin manifest validation (45 found) & skill lifecycle | PASS | 3829ms | - | Inspect config/plugins/ manifests and src/astra/brain/part3/evolution.ts |
| Voicebox | Voicebox provider adapter, status contract & speech synthesis | PASS | 3714ms | - | Inspect src/features/mayin/voice/VoiceboxProvider.ts |
| Voicebox | Audio round-trip delivery & TTS fallback chain | PASS | 3296ms | - | Inspect src/astra/voice/roundTrip/deliverResponse.ts |
| Flight Recorder | Measured span recording, token aggregation & secret scrubbing | PASS | 3561ms | - | Inspect src/astra/brain/part5/trace.ts |
| RBAC/Privacy | Production authentication, role authorization & PHI containment | PASS | 5820ms | - | Inspect server/rbac.ts and server/brain/privacy.ts |
| Frontend Build | TypeScript server compilation (tsc --noEmit -p tsconfig.server.json) | PASS | 8909ms | - | Run 'npm run typecheck:server' to inspect and fix compiler errors |
| Frontend Build | Vite production bundle integrity (dist/index.html) | PASS | 0ms | - | Run 'npx vite build' to generate production assets |
| E2E Dashboard | Playwright browser headless navigation & UI title verification | PASS | 8851ms | - | Ensure Vite server is up and index.html loads on http://127.0.0.1:5173 |
