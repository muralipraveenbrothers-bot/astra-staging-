# Astra wiring audit

Audited 2026-09-26 at `D:\astra PM`. This is an inventory of the code that is on disk. No running process was probed, and no service was restarted. Secrets are not printed.

Configured Vitest: 43 files passed, 8 failed, 462 tests passed, 10 failed. Two suites failed to import. One avatar websocket closed before the handshake finished. `npm run build` was not run.

## Already working — preserve

- Astra API is `server/index.ts` on `127.0.0.1:3000`, health `GET /api/health`. The UI is the Vite app on `5173`, routed by hash in `src/App.tsx`.
- Hospital records are a JSON file store: `data/hospital.json`, `data/hospital_profile.json`, and `data/audit.jsonl`, owned by `server/db.ts`.
- Saarathi (`server/saarathi/routes.ts`) is the voice and text front door: wake word, local intent, hospital command, Laya, orchestrator, 7D, and the brain frame.
- Voicebox local speech is `server/voice/voiceProviderRoutes.ts` to `127.0.0.1:17493`. Cloud TTS fails closed when it is not configured.
- Model order in code is FreeLLMAPI `31415`, then OmniRoute `20128`, then Ollama `11434`. Gateway tests show a dead provider does not invent an answer.
- Laya’s client and Python server are real. The loopback port in code is `8791`, health `GET /v1/tasks`. Clinical turns call four bounded tasks. The server refuses diagnosis and probability tasks.
- Astra 7D is `server/clinical/astra7dEngine.ts`. `synthesize7D` returns the D1–D7 object. The part-2 wrapper adds layers beside that object and does not replace it.
- Scientist PubMed access is implemented and tested. Book-skill routes exist. The Internal Browser and `src/services/astraServices.ts` open registered services at their existing URLs.
- Hospital screens for reception, wards, pharmacy, lab, radiology, billing, OT, nursing, and insurance are mounted in `src/App.tsx`.

## Exists but unwired

- LangGraph is three code paths: `server/langgraph.ts`, `server/brain/langGraphMaster.ts`, and `src/lib/agents/core/LangGraphOrchestrator.ts` plus `officialLangGraph.ts`. A Hermes node exists on the UI graph. The case spine is separate.
- Hermes is three surfaces: the CLI adapter, `HermesBrain`, and the evolution room. A normal clinical sentence does not travel through all three.
- `src/agents/core/ToolRegistry.ts` can run hospital tools. `server/brain/toolRegistry.ts` only decides which cards a role may see.
- Part-5 memory is an in-process list. The ordinary clinical turn does not read it. Mem0 is reported degraded on purpose. There is no live pgvector or Qdrant patient memory in this path.
- `analyzeSurgery7D` still builds one talar-neck plan for whatever procedure name it is given. The command-center roadmap does not call it, and it does not invent steps when no approved skill exists.
- Laya’s port is used in code and is missing from `config/ports.json`.
- The raw-transcript helper is not attached to every voice frame.

## Missing

- Mem0, the extraction model named in the specification, and a dedicated embedding model are not installed as Astra services.
- `src/astra/security/egressAllowList` and `src/astra/security/securityKernel` are imported by tests and are not in the tree. Those two suites do not load.
- The flight recorder stores a request id and a component list. It does not yet store measured latency, tokens, or cost.
- There is no verified historical length-of-stay table and no tariff table. The cost panel leaves amounts empty for that reason.

## Highest-risk breakages

- Two FreeLLMAPI gateway tokens do not match, one in the stack source and one in the Claude client settings. The token text is redacted.
- `scripts/dr_mayin_langgraph_router.py` and `scripts/start-dr-mayin-router.ps1` still name the retired FreeLLMAPI port `3001`.
- `server/db.ts` adds fixed numbers to outpatient and inpatient census counts (`+ 107` and `+ 28`). Those figures are not a pure count of stored patients.
- The n8n lab-ack idempotency test failed. Avatar status came back `REMOVED` where tests still expect `OFFLINE` or `READY`.
- A voice guardian test expected the words “couldn’t complete” and received the standing-by line instead.

## Recommended wiring order

1. Add Laya `8791` to `config/ports.json` without changing the port.
2. Delete the retired `3001` references in the two Dr Mayin scripts.
3. Point every gateway file at one secret source. Do not copy the key into source.
4. Restore or remove the missing security-kernel imports so the broken suites load.
5. Have the clinical Saarathi turn read and write classed memory only for the exact patient id.
6. Pick one LangGraph runtime and call it from the case spine.
7. Let a brain tool card call the existing tool executor after the role check.
8. Fill flight-recorder timing from the real call, and keep patient text out of that record.

## Flow notes

UI clicks reach Express, then the JSON store. A hospital command is decided before Laya and does not start Hermes. Laya runs on the clinical turn. Hermes and LangGraph meet only on some graphs. D1–D7 runs in-process and returns with the spoken answer. Tools and n8n are real only when that executor or a configured n8n is on the path. Memory writes through `/api/brain/memory` stay in the process. The browser opens a registered URL. Voicebox is the local speech engine. Model calls use the three-gateway chain. Telemetry today is the request id plus `data/audit.jsonl`.

Machine-readable copies: `reports/astra-modules.json`, `reports/astra-connections.json`, and `reports/astra-gaps.json`.
