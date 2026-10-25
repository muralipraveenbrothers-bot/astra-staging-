# ASTRA Master Skill Registry

Source specifications: the two pasted ASTRA prompt files supplied by the user. This registry is the implementation checklist; status is intentionally evidence-based and must not be changed to `complete` without a passing verification artifact.

## Core skills

| Skill | Required pipeline | Current integration | Status |
|---|---|---|---|
| ChatGPT Skill 1 — evidence/deep research | classify → select governed stores → retrieve → screen provenance → rank → synthesize → cite | `/api/knowledge/source-policy`, `/api/knowledge/research-plan`, evidence/vault, PubMed capability | integrated / tested |
| ChatGPT Skill 2 — natural conversation | language detect → normalize → endpoint turn → interrupt/pause → safe response | voice round-trip contracts, language detector, clinical turn interpretation | integrated / tested |
| General conversation intelligence | intent → tone → response mode → safe escalation | central command/orchestrator and response-mode metadata | integrated / tested |
| Memory and context intelligence | bounded continuity → patient context lock → provenance → retrieval | clinical conversation memory, patient context lock, living-case context | integrated / tested |
| Patient/family communication | audience → readability → language → simplify → review | Mitra Wellness via `/api/clinical/communication` | integrated / type-tested |
| Financial counselling | itemize → total → explain payment/assistance → audit | `/api/billing/counselling` | integrated / type-tested |
| Hospital operational intelligence | authorize → create → assign → acknowledge → execute → monitor → escalate → close | work-order engine, notifications, SLA, billing/result synchronization | integrated / full-suite tested |
| Continuous clinical intelligence | patient facts → trends → DDx → tests → uncertainty → doctor review | `/api/clinical/reason`, living-case enrichment, evidence/safety metadata | integrated / full-suite tested |
| Shared orchestration and closed-loop verification | one identity → one event ledger → one source of truth → verify | workflow guard, `/api/workflow/verify`, result and payment handoffs | integrated / full-suite tested |
| Doctor/CEO Command Center | live orders → owner → delay → notifications → billing → alerts → timeline | `/api/command-center/overview`, orders query, patient timeline | integrated / type-tested |
| Reception document intake | readable text → labeled fields → provenance → human review → registration | `/api/reception/document-intake`, Reception text-file attachment flow | integrated / focused-tested |
| Accountability success condition | completed/cancelled → otherwise owner + reason + escalation path | `/api/command-center/accountability` over the canonical work-order ledger | integrated / focused-tested |
| Protected RAG/MCP access | authenticated query → role/session gate → privacy-aware retrieval → auditable answer | `/api/rag/query`, `/api/rag/stats`, authenticated ingestion and MCP policy routes | integrated / focused-tested |
| Sanjeevani confirmation | propose → patient-scope → explicit confirmation → audited write tool | `confirmSanjeevaniActions` registered in the backend ToolRegistry | integrated / focused-tested |
| Executive intelligence | authorized operational snapshot → KPI synthesis → exception alerts → accountable recommendation | `POST /api/command-center/executive-report` and `ExecCeoAgent.generateReport` | integrated / focused-tested |
| Pragnya coordination | authenticated query → intent routing → safety metadata → auditable response | `POST /api/clinical/pragnya/route` via `PragnyaCoordinator` | integrated / type-tested |
| MCP fail-closed execution | discover → permission gate → explicit approval → execute → audit/sanitize | `server/mcp/mcpRoutes.ts` and `mcpSecurity` deny/approval path | integrated / focused-tested |
| RAG evidence integrity | classify → retrieve → evaluate → synthesize only from sources → validate citations → abstain on gaps | `server/rag/agenticRag.ts` routing, no-source abstention, citation integrity | integrated / focused-tested |
| Command Centre live execution | authenticated UI command → authoritative engine → real result → execution trace | `src/ui/command/CommandCentre.tsx` → `/api/command/execute` | integrated / app-type-tested |
| Authoritative CPOE gate | intent → patient/entity resolution → RBAC → approval for AI-originated orders → audit → deterministic mutation | `server/command.ts` behind authenticated `/api/command/execute` | integrated / server-gated |
| Real voice transcription | audio → authenticated local Voicebox proxy → raw/refined transcript → confidence; fail closed | `src/voice/VoiceboxEngine.ts` → `/api/voice/transcribe` | integrated / app-type + voice-suite tested |
| Lab document intake / OCR safety | readable text → governed intake → labeled fields/provenance → human review; image/PDF preview-only when OCR unavailable | `LabDashboard.tsx` → `/api/reception/document-intake`; no fabricated laboratory values | integrated / focused-tested |

## Clinical skills 1–16

The prompt defines these as a combined diagnostic, medical, surgical, pharmacological, ICU, safety, monitoring, and documentation capability set. The implementation maps them to the existing validated modules rather than creating parallel engines:

1. diagnostic differential and probability calibration — `HermesBrain`, scientist agent
2. pathophysiology and mechanism reasoning — scientist agent / clinical knowledge fabric
3. investigation selection and value — scientist investigation matrix, calculators
4. laboratory and pathology result interpretation — results loop and reassessment handoff
5. radiology/imaging interpretation workflow — radiology work orders and report loop
6. pharmacology and interaction safety — medication safety modules
7. medication prescribing/dispensing/admin separation — pharmacy and ward safety workflow
8. emergency triage and red flags — Saarathi/triage and critical-alert pipeline
9. ICU/ward deterioration monitoring — ward safety, vitals timers, escalation
10. surgical decision support — surgical roadmap and ortho-planner modules
11. anatomy and procedure planning — anatomy 3D and planner modules
12. perioperative and postoperative monitoring — OT/ward handoff modules
13. fluid, blood, and transfusion safety — ward/clinical safety contracts
14. longitudinal trajectory and response-to-treatment — living case and timeline
15. discharge and follow-up planning — Mitra, discharge workflows, billing closure gates
16. clinical documentation and audit — reports, audit trail, workflow events, provenance

## Universal safety invariants

- ASTRA is decision support; it does not independently diagnose, prescribe, administer, discharge, or perform invasive intervention.
- Patient facts come from the authorized patient context, never model memory.
- Consequential actions require role authorization, patient-context validation, and audit logging.
- AI-originated clinical orders require an approved doctor decision.
- External MCP/research tools are metadata-only until explicitly approved.
- Operational completion and clinical reassessment are separate states.
- Missing or stale data is surfaced as uncertainty, never treated as a negative finding.

## Verification record

- Full regression suite: 152 files, 1,064 passed, 1 skipped (verified 2026-10-13); focused reception intake test passes after Lab governed text-review integration.
- Server TypeScript check: passing after the latest integration slices.
- Focused results, patient-context, knowledge, routing, voice, and clinical suites: passing.

## Prompt-to-registry acceptance audit

The two supplied prompt files were compared against the rows above. The following requirements are represented in code and covered by automated evidence: ChatGPT Skills 1–2, 16 clinical skills, natural voice safety/cancellation/language routing, bounded memory and patient isolation, RAG provenance and abstention, MCP permission/approval/audit, local-model privacy routing, doctor-authorized hospital mutations, billing/work-order/result closure, reception intake, and Command Centre execution traces.

The following items remain explicitly open because they require an environment or human validation that automated tests cannot provide:

| Prompt requirement | Current status | Required evidence before final acceptance |
|---|---|---|
| Real microphone/acoustic accuracy, accents, code-switching, room noise, and speech fluency | code contracts and simulated tests pass; live acoustic validation not performed | Windows microphone test set with clinician review and measured transcript/latency/error rates |
| Production clinical validation of diagnostic or treatment suggestions | safety gates and deterministic tests pass; clinical validation not performed | licensed-clinician protocol review, anonymized cases, and signed acceptance record |
| Live Windows/browser deployment and every dashboard click path | production build passes; live deployment acceptance not performed | start the configured service, authenticate each role, exercise each route, capture failures and retest |
| External provider availability (Ollama/FreeLLMAPI/TTS/STT/RAG connectors) | fail-closed behavior verified; provider health depends on local configuration | provider health report from the target machine, with no PHI sent to unapproved routes |

## Runtime acceptance evidence — 2026-10-13

- Static route smoke check: the Vite preview returned HTTP 200 for `/`, `#/command-os`, `#/reception`, `#/ceo`, `#/doctor`, `#/lab`, `#/radiology`, `#/pharmacy`, `#/ward`, `#/ot`, `#/billing`, `#/anatomy`, `#/ortho-planner`, `#/staff`, `#/finance`, and `#/admin`.
- Browser interaction acceptance: Playwright can launch the installed Edge/Chrome channel; browser observation and browser-loop suites pass. Full manual acceptance of every authenticated dashboard role/click path remains a human acceptance item, not claimed from automated tests.
- FreeLLMAPI: built artifact present in staging; canonical port `31415` is supervised and the user-provided local `31416` endpoint authenticates its unified key for `/v1/models`.
- Ollama: `C:\Users\mural\AppData\Local\Programs\Ollama\ollama.exe` owns port `11434`; stack verification returns HTTP 200. The executable is not on the current PowerShell PATH.
- Voicebox: executable present at `C:\Users\mural\AppData\Local\Voicebox\voicebox-server.exe`; live microphone/acoustic validation still requires a foreground browser session and a human speaker.
- RouteLLM: staging `modules/RouteLLM/venv312` is present, `pip check` passes, the corrected launcher is running on port 6060, and stack verification returns HTTP 200.
- Clinician validation: not performed; requires a licensed clinician reviewer and approved test cases.

## Local service inventory — staging only (2026-10-13)

| Capability | Staging evidence | Runtime state |
|---|---|---|
| Hermes | `server/brain/hermesCortex.ts`, adapter, supervisor contracts | source integrated; port 9119 closed |
| Laya | `server/brain/layaDecisionApi.ts`, Laya decision routes | package-owned Python 3.12 venv and FastAPI adapter installed; staging launcher running; port 8791 `/v1/tasks` HTTP 200 |
| LangChain/LangGraph | `@langchain/core` and `@langchain/langgraph` in package lock; orchestrator modules | dependencies installed; no separate service port |
| Ollama / local mini-LLM | routing policy and provider adapters present | local executable owns port 11434; stack verifier HTTP 200; CLI PATH refresh still recommended |
| FreeLLMAPI | `freellmapi/server/dist/index.js` present in staging; canonical port 31415 configured | ports 31415 and user-provided 31416 are listening; screenshot unified key authenticates `/v1/models` on 31416 (HTTP 200), while 31415 returns HTTP 401 for that key; no credential is copied into source |
| RouteLLM | `modules/RouteLLM` source and launcher config | Python 3.12 venv with aligned dependencies and local source registration; corrected staging launcher running; port 6060 HTTP 200 |
| Book/skill ingestion | `server/ai/bookToSkillWorker.ts`, `bookToSkillRoutes.ts`, knowledge vault | source integrated; no external worker running |
| Scientist reasoning | `server/clinical/scientistAgent.ts` and tests | integrated and automated-tested |
| Voicebox / Whisper path | Voicebox client, STT/TTS routes, language detector and voice safety contracts | local server executable present; port 17493 listening and `/health` HTTP 200; CPU backend, model downloaded but not loaded until a generation request; live microphone test not performed |
| 7D / 360 / quantum-labelled capabilities | Astra 7D engine, anatomy/360 modules, routing metadata | local modules/tests present; no separate quantum service discovered |
| Agent/sub-agent orchestration | agent registry, task store, scheduler, worker controls | source integrated and tested; no worker service listening |
| n8n / OpenClaw | n8n bus/client and configured service definitions | ports 5678/18789 closed; no runtime binaries discovered in staging |

This table is intentionally strict: “source integrated” is not reported as “installed and running.” No files from `D:\astra PM` or another folder were used to mark a staging service healthy, and no GitHub state was changed.

## Dependency repair evidence — 2026-10-13

- FreeLLMAPI workspace dependencies installed locally under `freellmapi/node_modules`; `npm run build:server` passes.
- RouteLLM virtual environment created at `modules/RouteLLM/venv`; LiteLLM and websockets import successfully. The full editable RouteLLM package remains compatibility-limited by Python 3.14/NumPy source-build requirements and was not falsely marked installed.
- `npm run stack:preflight` now passes all required checks. It still reports only the non-blocking missing MediaPipe assets warning and an empty optional Gemini key.
- MCP/RAG/brain/voice/agent focused suite: **9 files, 60 tests passed**.
- Astra API started from staging on port 3000 and returned `/api/health` HTTP 200.
- Staging Vite UI started on port 5173; FreeLLMAPI started on port 31415 and passed the stack verifier (HTTP 401 on unauthenticated `/v1/models` is expected auth enforcement).
- `npm run stack:verify`: core services reachable; LLM route available through FreeLLMAPI/LiteLLM. Ollama, RouteLLM HTTP, Voicebox, Hermes, Laya, n8n, OpenClaw, and other optional extensions remain stopped or unavailable and are not reported as running.
- Follow-up runtime verification: staging Voicebox server is now listening on `127.0.0.1:17493`; Astra API `/api/health` remains HTTP 200. The verifier still reports only the optional OpenClaw/OpenHands/Hermes/Laya/agent/n8n extensions as down.
- MCP repair: installed/build-verified `medical-research-mcp-suite` (`dist/index.js`) and `medical-mcp` (`build/index.js`); corrected their `cwd`-relative launch arguments in `config/mcp-servers.json`. Medical MCP is listening on `7010` and returns MCP transport `406 Not Acceptable` to a plain browser GET, which confirms the endpoint is present and enforcing its transport contract.
- Healthcare MCP Public repair: installed its dependencies plus the undeclared local `dicom-parser` runtime dependency, started its HTTP server on `7017`, and verified `/health` returns HTTP 200. Its MCP endpoint remains transport-specific and is not represented as a generic browser page.
- MedCalc MCP repair: created `modules/medcalcmcp/venv`, installed FastMCP and calculator dependencies, started the calculator MCP server on `7016`, and verified its `/mcp` transport responds with `406 Not Acceptable` to a plain GET as expected.
- DICOM MCP repair: created `modules/dicom-mcp-server/venv`, installed the declared DICOM/MCP dependencies, pinned FastMCP 2.14.7 with MCP 1.30.0 for the repository's `mcp.server.fastmcp` API, verified Python compilation/imports and confirmed the stdio server remains alive during a startup probe. Editable installation is not supported by the module's flat layout, so the isolated runtime is intentionally dependency-installed rather than package-installed.
- BioMCP verification: the repository is a Rust/maturin project and declares a locked Cargo build as its canonical install/start path. The staging machine has no `cargo` or `rustc`, no compiled `biomcp.exe` exists, and therefore BioMCP cannot truthfully be marked installed or running. No substitute binary was copied from another folder.
- MCP-Slicer repair: created `modules/mcp-slicer/venv`, installed the editable package and declared MCP/Pillow/requests dependencies, compiled the Python sources, and verified the `mcp-slicer.exe` stdio process stays alive during startup. Full tool-call testing is pending because the required external 3D Slicer application and `uv` launcher are not installed on this machine; the repository smoke test hard-codes `uv` and therefore reports WinError 2 rather than a server-code failure.
- Health Record MCP verification: the module is a Bun/TypeScript SMART-on-FHIR server, but the staging machine has no `bun` executable. A bounded `npx bun` bootstrap attempt did not produce a runtime and was stopped; no dependency tree or server process was claimed. Live EHR/SMART validation also requires configured provider credentials and an authenticated sandbox.
- Medical Deep Research repair: removed a stale duplicate dependency block that made `requirements.txt` mathematically unsatisfiable (`fastapi>=0.110` versus `fastapi==0.109.2`), pinned `bibtexparser<2` for the `scholarly` API, installed the complete environment including `faiss-cpu`, verified imports/compilation, and started `server.py` successfully. A live probe returned HTTP 200 from `/docs`. Missing podcast/PPT/prose source trees are now explicit 503 capability responses instead of crashing the whole API at import. Its local suite passes 21 tests. The research module uses the user-provided live FreeLLMAPI screenshot endpoint `31416` and unified key; `/v1/models` returns HTTP 200 and exposes tool-capable models. End-to-end agent execution reaches the model router but is currently rate/cooldown limited, so no fabricated clinical result is claimed. The configured model is `qwen3.8-max` for the next retry. Astra’s global gateway remains canonical on `31415`, and preflight passes.
- OmniRoute verification: repaired its stale npm lockfile with `npm install --ignore-scripts` (2,433 packages installed), but the checked-out source is incomplete: both the declared build script and the dev launcher require missing `scripts/build/build-next-isolated.mjs`/`bootstrap-env.mjs`. Build and dev startup therefore fail with `ERR_MODULE_NOT_FOUND`; OmniRoute is not marked running.
- Agent Zero verification: source checkout and manifest are present under `modules/agentzero`. Isolated Python 3.12 environment `modules/agentzero/venv312` now installs the full declared dependency set; `pip check` passes, core imports (`litellm`, `fastmcp`, `faiss`) pass, and `whisper` imports successfully. The manifest was minimally relaxed from `faiss-cpu==1.11.0` to `faiss-cpu>=1.12.0` because 1.11.0 has no Python 3.12/3.14 wheel. A bounded native `run_ui.py` launch stayed alive for 8 seconds, but no listening port was observed before the probe was stopped. The documented Docker runtime is unavailable because no `docker` executable exists; native `kokoro` import did not complete within the bounded probe. Agent Zero is dependency-installed but not marked running.
- Voicebox live recheck: the existing local executable is running on `127.0.0.1:17493`; `/health` returned HTTP 200 with CPU/PyTorch backend and downloaded model state. No microphone/accent/noise acceptance test was performed in this environment.
- Agent health contract recheck: `server/agentops/astraDoctor.spec.ts` passes (1 file, 1 test), confirming explicit degraded/stopped reporting for unavailable Hermes/Laya/n8n dependencies rather than falsely reporting them healthy.
- Stack verifier recheck: `npm run stack:verify` exits 0; Astra API/UI, FreeLLMAPI, LiteLLM, OmniRoute, Voicebox, and the Voicebox bridge are reachable. RouteLLM, Ollama, Laya, Hermes, OpenClaw, OpenHands, Agent Zero, Paperclip, and n8n remain explicitly down/unavailable; the verifier reports Astra ONLINE because all core services are healthy and does not hide these capability notices.
- OmniRoute runtime correction: although this checkout's declared build/dev scripts remain incomplete, the live stack verifier currently observes an auth-protected HTTP 401 on `127.0.0.1:20128`; this proves a reachable serving endpoint, not a successful rebuild from the checked-out source.
- RouteLLM packaging repair: registered the local source through `modules/RouteLLM/venv312/Lib/site-packages/astra_routellm_local.pth`; aligned `datasets==2.20.0`, `pyarrow==17.0.0`, `dill==0.3.8`, `fsspec==2024.5.0`, `multiprocess==0.70.16`, Torch `2.5.1+cpu`, Transformers `4.51.3`, Tokenizers `0.21.1`, and HuggingFace Hub `0.34.4`. `pip check` passes, Torch imports, `routellm.openai_server` imports with a bounded dummy key, and `python -m routellm.openai_server --help` passes. No live model-backed server was started; port 6060 remains closed.
- RouteLLM live startup probe: launched the documented `random` router on port 6060 with local dummy credentials; after 20 seconds the process remained alive and TCP port 6060 was listening. The probe was stopped cleanly before any model request; no external model call or credential was used.
- RouteLLM launcher repair: corrected `scripts/start-routellm.cmd` from the retired `D:\astra PM` tree to `D:\Astra pmb\astra-staging`, switched it to `modules/RouteLLM/venv312`, and pointed its local FreeLLMAPI base URL to `31416`. A bounded launcher probe reached `127.0.0.1:6060`; logs show Uvicorn application startup complete. The probe was stopped afterward.
- RouteLLM managed runtime: started the corrected staging launcher and left it running; `npm run stack:verify` now reports RouteLLM HTTP 200 on `127.0.0.1:6060`, and the route inventory includes `routellm` as available alongside FreeLLMAPI, LiteLLM, and OmniRoute.
- Preflight alignment: updated `scripts/stack-preflight.mjs` to inspect the repaired `modules/RouteLLM/venv312`; installed its missing `websockets` dependency. `npm run stack:preflight` now passes all required checks; only the existing optional MediaPipe asset warning remains.
- Managed runtime recheck: after the preflight/launcher repair, port 6060 remains listening and `npm run stack:verify` reports RouteLLM HTTP 200 and Astra ONLINE. Optional Ollama/Laya/Hermes/OpenClaw/OpenHands/Agent Zero/Paperclip/n8n notices remain explicitly down.
- Ollama verification: no executable exists in PATH or standard Windows install locations and port 11434 is closed. An official `winget install Ollama.Ollama --silent` attempt downloaded the package but did not complete within the bounded command and was stopped; no partial executable or borrowed binary was used, so Ollama remains unavailable.
- Laya repair and runtime verification: recreated the package-owned `plugins/laya/.venv` with Python 3.12, completed the editable install (`laya==0.3.6`), installed the adapter's missing FastAPI/Uvicorn/Pydantic runtime dependencies, and confirmed `import laya` plus `pip check` pass. A bounded server launch completed application startup on `127.0.0.1:8791`; `GET /v1/tasks` returned HTTP 200 with the routing-task inventory. The probe was stopped cleanly afterward; no model-backed clinical probability is claimed.
- Ollama recheck: the previously bounded installer completed asynchronously after the earlier audit. `C:\Users\mural\AppData\Local\Programs\Ollama\ollama.exe` is now running and owns `127.0.0.1:11434`; stack verification returns HTTP 200. The executable is not on the current PowerShell PATH, so CLI discovery should use the absolute path or refresh PATH.
- Current managed-runtime snapshot: Astra API/UI, FreeLLMAPI, LiteLLM, RouteLLM, Ollama, OmniRoute, and Voicebox are reachable. Laya's direct server probe passes, but its hidden Start-Process wrapper did not preserve the command line and the port is currently stopped; it is therefore not falsely reported as a persistent managed service. OpenClaw, OpenHands, Hermes, Agent Zero, Paperclip, and n8n remain unavailable; Paperclip is intentionally not installed per user instruction.
- Laya managed launcher repair: added `scripts/start-laya.cmd` using the staging tree and package-owned Python 3.12 venv. Started it in a persistent command session; `GET /v1/tasks` returned HTTP 200 and `npm run stack:verify` now reports Laya HTTP 200. The launcher writes to `logs/laya.log` and does not install or depend on Paperclip.
- Regression gate after Laya integration: `npm run stack:preflight` passes all required checks (only the existing optional MediaPipe asset warning). Full Vitest rerun with the machine's browser startup allowance passes **152 test files, 1,064 tests passed, 1 skipped**. The initial default-timeout browser observation timeout was transient; its isolated rerun and the full 60-second-timeout suite pass.
- Static integration gate recheck: `npm run lint` completed successfully (`tsc -b` followed by the server TypeScript check) with no diagnostics.
- Extension-supervisor alignment: corrected `ecosystem.extensions.config.cjs` to the staging root and `RouteLLM/venv312`, and registered the verified optional `scripts/start-laya.cmd` launcher. Preflight now loads 8 extension apps and passes all launcher/path checks without adding Paperclip or other deleted services.
- Supervisor root audit: corrected `ecosystem.config.next.cjs`, `ecosystem.recovery.config.cjs`, and `ecosystem.ui.config.cjs` from the retired `D:\astra PM` path to `D:\Astra pmb\astra-staging`. Preflight validates all four ecosystem configurations and every supervised script now resolves within the staging tree.
- Runtime-script migration audit: corrected active `start-mcp.cmd`, `start-astra-vite.ps1`, `autoconnect-services.ps1`, and `start-keep-runtimes.cmd` references to the staging root. The keep-runtimes entry now calls the staging autoconnect loop instead of a deleted root-level launcher. Preflight remains green; quarantine/history documents and intentionally retired helper scripts were not executed or used as runtime evidence.
- Runtime recheck after migration: `npm run stack:verify` reports Astra core, FreeLLMAPI, LiteLLM, RouteLLM, Ollama, OmniRoute, Laya, and Voicebox healthy. The remaining old-path text is confined to historical/quarantine or launchers for unavailable/deleted runtimes; no such launcher is used by the active supervisor.
- Dependency isolation repair: replaced the `node_modules` junction targeting `D:\astra PM\node_modules` with a real staging-local install (`npm install --ignore-scripts --no-audit --no-fund`, 616 packages). `node_modules` is now a directory inside staging, `npm run build` succeeds, preflight succeeds, and the full suite passes **152 files, 1,064 tests, 1 skipped** without borrowing the old project dependency tree.
- Live browser acceptance checkpoint: the running in-app browser reaches the Astra command-center sign-in screen, but every authenticated dashboard click path requires the administrator PIN. No credential was entered or bypassed during this audit; authenticated manual acceptance remains an explicit user-operated step.
- MediaPipe asset completion: added the official Hand Landmarker model to `public/mediapipe/models/hand_landmarker.task` and copied the WASM binary from the staging-local `@mediapipe/tasks-vision` dependency into `public/mediapipe/wasm`. Preflight now reports `MediaPipe assets vendored locally PASS`.
- Post-asset integration gate: production `npm run build` completes successfully (3,950 modules transformed); `npm run stack:verify` remains green for Astra core, all active LLM routes, Ollama, Laya, and Voicebox.
- Gesture regression after asset completion: `MayinGestureController.spec.ts` and `ViewerGestureProcessor.spec.ts` pass **27/27 tests** against the staging-local gesture implementation.
- Live capability audit: Astra `/api/health`, Laya `/v1/tasks`, Healthcare MCP `/health`, and Voicebox `/health` returned HTTP 200. Medical MCP `/mcp` returned HTTP 406 as expected for a plain HTTP GET because it requires its MCP transport contract; this is not treated as a service failure.
- Prompt coverage audit: the two supplied files contain 45 and 54 numbered explanatory sections respectively; the implementation registry intentionally normalizes those narratives into **22 core capability rows plus 16 clinical skill rows**, with the acceptance-audit section preserving the non-code requirements (human clinician review, acoustic testing, authenticated browser acceptance, and provider credentials).
- Dependency integrity recheck: `npm ls --depth=0 --link=true` finds no linked packages back to another project tree. It reports only two local extraneous optional packages (`@emnapi/runtime`, `@img/sharp-wasm32`), with no unresolved dependency errors.
- Dependency cleanup attempt: `npm prune --ignore-scripts --no-audit --no-fund` completed without changing the tree; the same two optional local extraneous packages remain and do not affect build, tests, or runtime. No linked/borrowed dependency was introduced.
- Laya model-load follow-up: the managed process successfully downloaded/initialized its checkpoint and emitted `POST /v1/decide_batch 200`, but the local model consumed approximately 4.9 GB and subsequently lost its listener. The process was stopped by exact PID to avoid leaving an unstable high-memory worker running. The adapter/package remains installed and direct startup is verified; persistent model-serving is not claimed until resource limits/model selection are addressed.
- Laya resource mitigation: the launcher now requests only the `typed-decisions` checkpoint instead of the default multilingual set. A fresh launch completed initialization, returned `POST /v1/decide 200` for department routing, and serves `/v1/tasks` HTTP 200. Single-checkpoint resident memory is still approximately 5.2 GB on this CPU-only host, so the service is functionally verified but remains an optional high-memory runtime rather than a core Astra dependency.

These are not silently marked complete. No known automated test failures remain in the current workspace.
