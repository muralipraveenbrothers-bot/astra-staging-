# ASTRA Final Architecture

Generated: 2026-09-27

## Release Classification

**NOT_READY**

The unified ASTRA verifier passed all required gates, but the full release-candidate command set did not. `npm run lint` and `npm run build` both fail on existing TypeScript errors in Sanjeevani/test files and related tool-definition contracts. `npm run stack:preflight` also fails because `litellm[proxy]` is not importable in the configured Python environment. No install command was run.

## Runtime Topology

ASTRA runs as a local-first hospital operations and clinical reasoning stack:

| Component | Runtime | Port / Path | Acceptance Evidence |
| --- | --- | --- | --- |
| Astra API | Express / TypeScript | `http://127.0.0.1:3000` | PASS in `scripts/verify-astra.ps1` |
| Astra UI | Vite / React | `http://127.0.0.1:5173` | PASS in `scripts/verify-astra.ps1` |
| JSON hospital store | Local JSON store | `data/hospital.json` | PASS in verifier; file was not modified |
| Saarathi | Local conversational engine | `/api/saarathi/*` | PASS in verifier |
| Voicebox | Local speech service | `http://127.0.0.1:17493` | PASS in verifier |
| FreeLLMAPI | Primary model gateway | `http://127.0.0.1:31415` | PASS in verifier |
| OmniRoute | Fallback model gateway | `http://127.0.0.1:20128` | PASS in verifier |
| Ollama | Local PHI model fallback | `http://127.0.0.1:11434` | PASS in verifier |
| Laya | System-1 decision nucleus | `http://127.0.0.1:8791` | PASS in verifier |
| Hermes | Supervisory cortex | In-process / registered service | PASS in verifier |
| LangGraph | Clinical workflow engine | In-process | PASS in verifier |
| D1-D7 | Clinical dimensions engine | In-process | PASS in verifier |
| Scientist / skills | Evidence and skill layer | `/api/intelligence/skills` | PASS in verifier |
| Internal Browser | API-first service browser | UI route + service registry | PASS in verifier |
| Tool / Service Registry | Tool authorization and service contracts | In-process | PASS in verifier |
| Memory Fabric | Scoped memory gates | In-process | PASS in verifier |
| Flight Recorder | Local trace spans and metrics | In-process | PASS in verifier |
| Dashboards | UI health surfaces | API-backed | PASS in verifier E2E |
| n8n | Optional workflow extension | `http://127.0.0.1:5678` | WARN only; service offline |

## Verified Wiring

| Wiring | Status | Evidence |
| --- | --- | --- |
| Laya -> Hermes | WIRED | Laya and Hermes categories passed in unified verifier |
| Hermes -> LangGraph | WIRED | Hermes dispatch and LangGraph checkpoint/resume passed |
| LangGraph -> existing 7D | WIRED | LangGraph and complete D1-D7 synthetic case passed |
| Hermes -> Scientist / skills | WIRED | Hermes dispatch, Scientist, and plugin/skill lifecycle passed |
| Tool Registry -> plugins | WIRED | Tool Registry and plugin manifest validation passed |
| Internal Browser -> Service Registry | WIRED | Internal Browser service routing passed |
| ModelGateway -> FreeLLMAPI with OmniRoute fallback | WIRED | ModelGateway failover and PHI lock passed |
| PHI -> local-only model | WIRED | RBAC/Privacy and ModelGateway PHI lock passed |
| Memory Fabric | WIRED | Scoped memory gates and patient isolation passed |
| Voicebox | WIRED | Voicebox provider and round-trip delivery passed |
| Flight Recorder | WIRED | Span recording, latency, token aggregation, and secret scrubbing passed |
| Dashboards -> live health APIs | WIRED | Unified E2E dashboard check passed |

## Privacy and Permission Boundary

The acceptance run verified local PHI containment through `ModelGateway` and RBAC/privacy checks. PHI is required to stay on local models and fail closed when the local model path is unavailable. Secrets and patient text must not be logged. This run did not modify `data/`, `.env`, or secret files.

## Start After Reboot

Use the existing launchers; do not reinstall dependencies:

```powershell
npm ls --depth=0
pm2 resurrect
pm2 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-astra.ps1
```

If PM2 state is not available, start the known services with the repo launchers:

```powershell
.\start-astra-api.cmd
.\start-astra-vite.cmd
.\start-freellmapi-server.cmd
.\scripts\start-omniroute-external.cmd
.\scripts\start-voicebox-server.ps1
python server/plugins/astra_laya_server.py --port 8791
```

Then verify:

```powershell
npm run typecheck:server
npm test
npm run stack:contract
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-astra.ps1
```

## Current Blockers

1. Full project `npm run lint` fails on existing TypeScript errors outside the server typecheck gate.
2. Full `npm run build` fails on the same TypeScript errors before Vite can rebuild production assets.
3. `npm run stack:preflight` fails because `litellm[proxy]` is not importable in the configured Python environment.
4. Standalone `npx playwright test` attempted a network/package fetch and failed with `EACCES`; the unified verifier's E2E dashboard check passed.
