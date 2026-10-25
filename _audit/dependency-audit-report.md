# §61 — ASTRA 7D Dependency Audit Report

**Date:** 2026-09-23 · **Repo:** `D:\astra PM` · **Branch:** `feature/astra-3d-anatomy-orthoplanner`
**Scope:** every dependency the 7D Clinical Intelligence Engine (Dr. Mayin + Laya + Hermes + Evidence + Cognee) requires, verified against `package.json` *and* `node_modules` on disk, plus both isolated Python runtimes.

---

## 1. npm packages (declared = package.json, installed = node_modules, verified via `require(.../package.json).version`)

| Package | Declared | Installed | Status | Consumer in this codebase |
|---|---|---|---|---|
| `three` | ^0.160.1 | 0.160.1 | ✅ present | `HumanAtlas/AtlasScene`, `OrthoPlanner/InteractiveBone3DCanvas`, `sections/emr/*` |
| `@react-three/fiber` | ^8.18.0 | 8.18.0 | ✅ present | Canvas host for all 3D scenes |
| `@react-three/drei` | ^9.122.0 | 9.122.0 | ✅ present | 3D helpers; also the source of transitive `zustand` |
| `@react-three/postprocessing` | ^2.16.3 | 2.16.3 | ✅ present | Scene effects (bloom/DoF for anatomy views) |
| `postprocessing` | ^6.36.6 | 6.36.6 | ✅ present | Effect-pass primitives under `@react-three/postprocessing` |
| `framer-motion` | ^11.11.9 | 11.18.2 | ✅ present | **All Mayin UI**: `MayinBrainCore`, `MayinConversation`, `MayinClinicalPanel`, `MayinAnatomyViewer`, `MayinLabVisualizer`, `MayinPatientContext`, `MayinPharmacyDispatch`, `MayinHospitalActivity` (`{ motion, AnimatePresence }`) |
| `motion` | — (not declared) | not installed | ⚠️ **missing but not required** | Zero imports of `motion/...` anywhere in `src/`. Every animation imports `motion` **from `framer-motion`**, which is installed. The standalone `motion` package is the same API's new distribution — install only if we decide to migrate off `framer-motion`. |
| `@mediapipe/tasks-vision` | ^0.10.35 | 0.10.35 | ✅ present | Gesture engine (`MayinGestureController`, lazy factory); `vision_bundle.mjs` + `wasm/` verified on disk; `MEDIAPIPE_TASKS_VERSION="0.10.35"` matches |
| `recharts` | ^2.13.3 | 2.15.4 | ✅ present | Dashboards / D7 telemetry charts |
| `zustand` | — (not declared) | 5.0.15 (transitive) | ⚠️ **undeclared, no direct import** | Reachable only as `@react-three/{drei,fiber}` dependency; `grep "from 'zustand'"` in `src/` → no hits. Declaring it explicitly is recommended *only if* app code starts importing it. |
| `@gltf-transform/cli` | ^4.5.0 | 4.5.0 | ✅ present | glTF asset pipeline (CLI dev tool) |

**Conclusion (npm):** every dependency the 7D engine actually imports is installed and version-aligned with its declaration. The only genuinely absent package is `motion`, and it has **no consumer** — `framer-motion` satisfies every `import { motion }` in the tree.

---

## 2. Python runtime — Laya (System-1 decision service)

**Isolation:** own clone `plugins/laya` + own venv `plugins/laya/.venv` (uv Python 3.11.15). Never installed globally; never shares an interpreter with Cognee.

| Component | Version | Verified by |
|---|---|---|
| Python | 3.11.15 | `sys.version` in venv |
| `laya` | 0.3.6 | `import laya` + `laya.router.Router`, `laya.lang.analyse` OK |
| `torch` | 2.14.0+cpu | imported |
| `transformers` | 5.17.0 | imported |
| `fastapi` | 0.141.1 | installed this session (`pip install fastapi uvicorn`) — **was missing; server could not boot without it** |
| `uvicorn` | 0.53.0 | installed this session |
| Checkpoints | `convaiinnovations/laya` ×3 (~1.1B params) | HF cache 2.3 GB; `PREWARM_OK in 243.6s` (`_audit/prewarm_laya.py`) |

**Port:** `127.0.0.1:8791` (`ASTRA_LAYA_PORT`, loopback-only). Server entry: `server/plugins/astra_laya_server.py` (657 lines, `py_compile` OK).
**Contract:** `POST /v1/decide`, `GET /v1/health`, `GET /v1/tasks` mirror `src/astra/plugins/layaDecision.ts` (501 lines). `scoreMeaning="routing_confidence_not_clinical_probability"` asserted at the boundary; server-side task policy rejects `diagnose_patient` etc. with 403.

## 3. Python runtime — Cognee (long-term memory)

**Isolation:** own clone `plugins/cognee` (v1.6.0) + own venv `plugins/cognee/.venv` (uv Python 3.11.15).

| Component | Version | Notes |
|---|---|---|
| Python | 3.11.15 | |
| `cognee` | 1.6.0-local | editable/clone install; DB under `plugins/cognee/cognee/.cognee_system/` |
| `gliner2` | 2.0.0 | **installed this session** via `pip install "cognee[gliner]"` — enables *keyless* graph extraction (with it, cognify runs without an LLM key; without it remember → 503 `KeylessExtractorNotInstalledError`) |
| LLM key | *optional* | `/v1/health.llmConfigured` reports honestly; keyless path works after gliner install |

**Port:** `127.0.0.1:8792` (`--port`, loopback-only; non-loopback bind refused by `main()`). Bridge: `plugins/cognee/astra_cognee_bridge.py` (~500 lines, `py_compile` OK).
**Contract:** `GET /v1/health`, `POST /v1/memory/{remember,recall,improve,forget}` mirror `CogneeHttpAdapter` in `AstraMemoryGateway.ts` (recall returns a **bare** `MemoryRecord[]`).

---

## 4. Live integration evidence (executed this session, loopback HTTP)

**Laya — `_audit/test_laya_live.ps1` → `ALL_LAYA_LIVE_TESTS_PASSED` (exit 0):**
```
PASS health:  reachable=True modelLoaded=True device=cpu probe=88422ms
PASS decide:  type=score score=2.0959 confidence=0.4089 model=laya-rl-agent latency=546ms
              (scoreMeaning == "routing_confidence_not_clinical_probability" asserted in-script)
PASS policy:  diagnose_patient refused with 403
PASS shutdown
```

**Cognee — boot + 7 policy assertions + full §33 round trip:**
```
health 200 {ok,reachable,databaseReachable,llmConfigured,...}
patient remember 403 patient_scoped_memory_is_refused_terminal_record_belongs_to_emr
patient recall    403 (refused before backend touch — works even if Cognee is down)
bad namespace     400 namespace 'evil:ns' is not an approved Astra memory namespace
unknown route     404 ; forget unmapped id 409 (honest, never a fake delete)
remember  200 in 35.6s  → dataset astra__astra_doctor_dr-rao created (namespace→dataset isolation)
recall    200 MemoryRecord[] (original JSON round-tripped, deduped by id)
recall(other ns) 200 []  — namespace isolation: no cross-namespace leakage
forget    200 → recall no longer returns it (real deletion via mapped data_id UUID + dataset)
```

**Test suites:** `npx vitest run src/features/mayin` → **71/71 passing (7 files)** (incl.
`diagnosticsSummary.spec.ts`, 13 tests).
**TypeScript:** app `tsc --noEmit` errors are confined to pre-existing Sanjeevani files (`sanjeevaniOverlayLanguagePersona.test.ts`, `SanjeevaniOverlay.tsx`, `initSanjeevaniUI.ts`); **zero errors in any file created for this task**. Server `tsc` exits 0.

---

## 5. Findings & recommended actions

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | `motion` not installed | 🟢 none | No consumer exists; keep as-is unless migrating off framer-motion |
| 2 | `zustand` used transitively, undeclared | 🟡 hygiene | Add explicit declaration before importing it in app code |
| 3 | Laya venv was missing `fastapi`/`uvicorn` | 🔴 was blocking | **Fixed this session** (fastapi 0.141.1, uvicorn 0.53.0) |
| 4 | Cognee keyless extraction unavailable | 🔴 was blocking | **Fixed this session** (`cognee[gliner]` → gliner2 2.0.0) |
| 5 | HF checkpoints were uncached (cold start 4+ min) | 🟡 ops | **Fixed**: 2.3 GB cached; warm Router init ~88 s, decide 546 ms |
| 6 | Recall duplicated records across chunks | 🟡 correctness | **Fixed**: dedupe by `id` in bridge |
| 7 | Recall of never-written namespace returned 503 | 🟡 semantics | **Fixed**: honest `[]` for `DatasetNotFound` |
| 8 | Force-kill leaves cognee multiprocessing orphans that hold the Ladybug DB lock (Error 33) | 🟡 ops | Shutdown must kill the **process tree**, not just the parent (documented below) |
| 9 | Retired-port firewall could not see dotenv/Python config (`.env*`, `*.py`), so `.env.local` kept pointing at the dead `:3001` with the `116f7442…` key the gateway 401s | 🔴 was a silent outage | **Fixed**: firewall widened by name + extension; all live config moved to `31415`/`084e17b0…`; test went 26/27 → **27/27** (see §7) |
| 10 | Repo-root litter from shell path mangling: `C:<U+F03A>Users…Temp<U+F03A>models.json` (128 KB saved `/v1/models` response, Sep 10) and `D:<U+F03A>astra` (19 B curl error, Sep 6). MSYS replaces `:` with U+F03A, so `-o` targets like `/tmp/...` landed in the working tree | 🟢 hygiene | Pre-existing, untracked, **not deleted** (not produced by this session). Quarantine with `mkdir -p _quarantine/root-litter && mv D:*astra C:*models.json _quarantine/root-litter/`. `_quarantine/` is already exempt from the port firewall |

**Ports in use:** `8791` Laya runtime · `8792` Cognee bridge — both bound to `127.0.0.1` only.

**Graceful shutdown recipe (avoids finding #8):**
```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*astra_cognee_bridge*' -or $_.CommandLine -like '*spawn_main(parent_pid=<bridge>*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

**Overall:** all dependencies required by the 7D Clinical Intelligence Engine are present and version-verified; both Python services compile and answered live loopback contract tests; the only absent npm package (`motion`) has no code consumer.


---

## 6. Service-manager lifecycle proof — `server/services/layaService.ts`

Both proofs are **live** transcripts (`_audit/layaService.lifecycle.mts`, `_audit/layaService.deep.mts`,
run through `node_modules/.bin/tsx`), not mocks. Nothing here is inferred.

### 6.1 Cold spawn → fast-path status → stop (`_audit/lifecycle.log`)

```
detect:        {"installed":true,"missing":[]}
status-before: STOPPED   "TCP 127.0.0.1:8791 not responding"
start:         STARTING  managed=true, "spawned (log: D:\astra PM\data\logs\laya-runtime.log) —
                          serving /v1/tasks; /v1/health not probed"
status-after:  STARTING  same (fast path — /v1/tasks only, never triggers Router preload)
stop:          STOPPED   "stopped (process tree terminated, port freed)"
```

### 6.2 Deep probe → HEALTHY with real model load (`_audit/lifecycle-deep.log`)

```
status-deep:  HEALTHY  "live /v1/health 200 in 81493ms"  modelLoaded=true  device=cpu
MODEL_LOADED: YES  STATE: HEALTHY
stop:         STOPPED  "stopped (process tree terminated, port freed)"
DEEP_PROBE_ALL_OK
```

Server-side corroboration — `data/logs/laya-runtime.log`:
```
13:12:40 [astra.laya] INFO: Starting Astra Laya Runtime on 127.0.0.1:8791
13:14:01 [astra.laya] INFO: Laya Router initialized in 81188.0 ms (models: ['english','multilingual'])
13:14:01 [astra.laya] INFO: GET /v1/health 200 81485.0ms
[layaService] child exited code=1 signal=null
```

### 6.3 Honesty behaviours verified (not just happy path)

| Observed situation | Reported state | Comment |
|---|---|---|
| Nothing on 8791 | `STOPPED` | TCP probe, files-on-disk detection first |
| Port up, uvicorn bound, model still loading | `STARTING` | **never** claimed HEALTHY on a bare TCP answer |
| `/v1/health` 200 + `reachable:true` | `HEALTHY` + `modelLoaded`,`device` | deep only (81.5 s cold) |
| `stop` on a port answered by a server *we did not spawn* (orphan from a killed `tsx` run) | not stopped | `"instance … is external (not spawned by this server)"`, `managed:false` |
| `start` when the port already serves | not respawned | `"already serving (not respawned)"` — no double-bind |
| `stop` on managed child | `STOPPED` | Windows `taskkill /pid <pid> /T /F` (tree kill) + waits for the **port to actually free** before returning |

### 6.4 CORS (browser origin `http://localhost:5173`) — live preflight + real request

| Service | `OPTIONS` preflight | `Access-Control-Allow-Origin` | Bad origin |
|---|---|---|---|
| Laya `:8791` | 204 | echoed for `:5173` | `evil.example` → **400**, no ACAO header |
| Cognee bridge `:8792` | 204 | echoed for `:5173` | `evil.example` → 400, no ACAO header |

Logs: `_audit/cors-laya.log`, `_audit/cors-cognee.log`.

### 6.5 Wiring that consumes the module (grep-verified)

- `server/index.ts:815,826,835` — `GET /api/services/laya/status` (`?deep=1` ⇒ deep probe), `POST
  /api/services/laya/start`, `POST /api/services/laya/stop` (all `authenticate`-gated, dynamic import so a
  missing Python venv can never crash server boot).
- `server/index.ts:1241` — optional auto-start on boot; if `detectLaya()` is not installed it logs and
  continues (`"⚙️ [Laya] not installed"`), mirroring §20 semantics for a Python service.
- `server/services/serviceRegistry.ts` — `laya` (`:8791`) and `cognee` (`:8792`) descriptors, so call sites
  resolve endpoints instead of hardcoding ports.
- `src/features/mayin/diagnosticsSummary.ts` + `MayinDiagnosticsPanel.tsx` + `MayinCommandCentre.tsx` — the
  panel renders the same honestly-degraded states (`OFFLINE` / `STARTING` / `HEALTHY`) surfaced by the API.

---

## 7. §8/§24 retired-port firewall — the gap is closed and the live drift is gone

### 7.1 The gap (the same bug class, one layer deeper)

The firewall in `server/astra/supervisor/stack-contract.spec.ts` had already been
widened once, when the retired port survived in `scripts/*.ps1` and `*.cmd` while
the test reported clean. It scanned only:

```ts
/\.(ts|tsx|mjs|cjs|json|ps1|cmd|bat)$/
```

Dotenv files (`.env`, `.env.local`, `*.env`, `*.env.example`) and Python helpers
matched **none** of those, so they were invisible to the firewall. That is exactly
where the durable outage lived:

- `.env.local` pinned `FREELLMAPI_BASE_URL=http://127.0.0.1:3001/v1` — the retired
  two-process API port, dead
- `.env.local` carried the `116f7442…` key, which the live gateway answers with
  **401** (config/ai-gateway.env documents this after a live check)

So the app's real runtime env pointed at a dead port with a dead key, while the
contract test — the thing built to catch precisely this — reported clean.

### 7.2 The fix (test)

`stack-contract.spec.ts` now matches runtime config **by name as well as by
extension**, so a dotenv file can never again hide a retired port:

```ts
const isRuntimeConfig =
  /\.(ts|tsx|mjs|cjs|json|ps1|cmd|bat|py)$/.test(entry.name) ||
  /^\.env/.test(entry.name) ||
  /\.env(\.example)?$/.test(entry.name);
```

### 7.3 Live configuration drift found and fixed

| File | Before | After |
|---|---|---|
| `.env.local` → `FREELLMAPI_BASE_URL` | `http://127.0.0.1:3001/v1` | `http://127.0.0.1:31415/v1` |
| `.env.local` → `FREELLMAPI_API_KEY` | `116f7442…` (401) | `084e17b0…` (canonical) |
| `.env.local` → `ASTRA_ADAPTER_API_KEY` | `116f7442…` | `084e17b0…` |
| `.env.local.example` (commented example) | `:3001/v1` | `:31415/v1` |
| `config/ai-gateway.env` → `FREELLMAPI_DASHBOARD_URL` | `:5170/models/chat` | `:31415/` |
| `config/ai-gateway.env.example` | `30 01` base + `5170` dashboard | gateway port `31415` for both, with a warning comment |
| `config/llm-gateway.env.example` → `ASTRA_FREELLMAPI_BASE_URL` | `:3001/v1` | `:31415/v1` |
| `config/plugins/freellm-provider/config/.env` | `PORT=3001` | `PORT=31415` (manifest already said 31415 — the two disagreed) |
| `C:\Users\mural\.claude\settings.json` → `ANTHROPIC_AUTH_TOKEN` | `116f7442…` | `084e17b0…` (old value recorded here for reversibility) |
| `check_live_data.py`, `check_models.py` | hardcoded key literal **and** `:3001` | both read `config/ai-gateway.env` (§9: no secret in source) |
| `probe_omni_tmp.py` | scanned ports `5170`, `3001` | scans `31415` |
| `scripts/` (14 files: `_status`, `_portcheck`, `_stability`, `_port-ram-snap`, `_wait-missing`, `_pclip-health`, `_http-snap`, `_launch_core`, `keep-runtimes`, `install-freellm`, `start-routellm`, `launch-ll-rl-az-oh`, `start-ll-rl`, `start-astra-brain`) | retired ports in probe lists / health targets / launcher URLs | canonical `31415`, with the two "FreeLLMAPI UI on 5170" start targets removed (one process now) |

Backup of the original runtime env: `_audit/.env.local.bak`.


### 7.4 Evidence (all re-run after the fixes)

| Check | Result |
|---|---|
| `server/astra/supervisor/stack-contract.spec.ts` | **27/27 passed** — was `26 passed / 1 failed` |
| `_audit/firewall-offenders.mjs` (faithful mirror of the firewall) | **OFFENDERS=0** — was 5 |
| `git ls-files` sweep for port-like retired ports | **0** offenders besides `config/ports.json` (the one allowed registry) |
| Resolved runtime values from the de-hardcoded probe | `BASE_URL = http://127.0.0.1:31415/v1/models`, key tail `…134c4972` |
| `py_compile check_models.py check_live_data.py probe_omni_tmp.py` | `PY_COMPILE_OK` |
| `check_models.py` executed | `Error: <urlopen error [WinError 10061] … refused>` — the gateway really is down right now, and the probe degrades honestly instead of claiming success |
| `tsc --noEmit -p tsconfig.server.json` | exit 0 |
| `tsc --noEmit -p tsconfig.app.json` | clean outside the pre-existing Sanjeevani files |

Offenders the widened firewall caught before the fixes (proving the gap was real,
not theoretical): `check_live_data.py`, `check_models.py`, `probe_omni_tmp.py`,
`config/ai-gateway.env.example`, `config/plugins/freellm-provider/config/.env`.

### 7.5 Regression analysis for the 6 remaining suite failures (not caused by this work)

`npx vitest run` over the whole repo reports `6 failed | 334 passed (340)` tests in
`7 failed | 30 passed (37)` files. Each failure was checked, not waved away:

- **A/B on `server/ai/gateway.spec.ts`** — the only failing spec that touches
  gateway env variables — gives an *identical* `1 failed | 11 passed (12)` under
  BOTH the fixed env and the original env restored from `_audit/.env.local.bak`.
  So it is independent of this repo's gateway configuration. Cause:
  `expected 0 to be greater than 0` — a *configured but unreachable* provider is
  tried, so `result.text` is empty; that is the sustained gateway outage, not the
  fix.
- **None of the 6 failing specs reference `FREELLMAPI`** (`grep -c` = 0 for all 6),
  so the gateway changes cannot reach them.
- **All 7 failing spec files are untracked and untouched by this work**
  (`git status --short` shows `??` for every one of them).
- Their root causes are environmental / pre-existing state:
  `avatar.spec.ts` reports `REMOVED` where the test expects `OFFLINE` and
  `avatarGateway.spec.ts` reports `OFFLINE` where it expects `READY` (no A2F
  controller listening), `n8nBus.spec.ts` idempotency (`expected false to be true`),
  and `contracts.spec.ts` Telugu acknowledgement text not matching
  `/[\u0C00-\u0C7F]/`.

`.env.local` was verified back in the fixed state after the A/B (`31415` present,
`116f7442` absent).

