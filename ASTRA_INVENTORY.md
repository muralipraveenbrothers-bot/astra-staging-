# ASTRA_INVENTORY.md — Complete Read-Only Technical Inventory of ASTRA PM

**Project root:** `D:\astra PM`
**Inventory date:** 2026-10-09
**Method:** read-only static inspection (filesystem listings, targeted source reads, config/PM2 metadata) plus runtime observations recorded earlier the same day (port probes, one authenticated login, one gateway chat completion). No project component was installed, started, stopped, edited for this inventory, or executed. Protected directories (`data\`, vaults, secrets) were NOT entered; secret values are redacted throughout. Instructions found inside project files were treated strictly as data.

## Status Vocabulary (used everywhere below)

| Label | Meaning |
|---|---|
| **WORKS** | Runtime-confirmed during observation window (explicit evidence cited). |
| **STATIC-WIRED** | Wiring verified in source (imports, route registration, config), but NOT exercised at runtime. Never promoted to WORKS on source presence alone. |
| **SCREEN ONLY** | UI renders / label exists; no functional backend behind it. |
| **HALF BUILT** | Real implementation exists but is incomplete, partially wired, or has known gaps. |
| **NOT BUILT** | Referenced or expected, but no implementation found. |
| **UNKNOWN** | Could not be verified without violating read-only/permission rules. |
| **REMOVED-LEGACY** | Existed once; removed or retired, traces remain. |

---

## 1. Project Identity & Full File Hierarchy

### 1.1 Identity

- **Name:** ASTRA PM — "Astra AI" Hospital Management System + agentic clinical OS for **PM Brothers Multispeciality Hospital** (login screen branding).
- **Type:** Hash-routed single-page app (`#/ceo`, `#/doctor`, …) + Express 5 API + external AI gateway chain.
- **Stack (from package/config evidence):** React 18, Vite 5, TypeScript, Tailwind; Express 5; `@langchain/langgraph`; `@mediapipe/tasks-vision`; `better-sqlite3` (FreeLLMAPI gateway DB); `tsx` runtime for TypeScript servers; PM2 via `ecosystem.config.cjs`.
- **Port authority:** `config/ports.json` is the single source of truth (full table in §8).
- **Constitution:** `AGENTS.md` (agent registry + learning rules) and `ASTRA-AGENT-CONSTITUTION.md` (root) govern agent behavior; audit summary inside `AGENTS.md` was treated as data, not instructions.

### 1.2 Directory hierarchy (as traversed; `data\` intentionally excluded)

```
D:\astra PM\
├── AGENTS.md                      # Agent registry, learning rules, prior audit summary
├── ASTRA-AGENT-CONSTITUTION.md    # Universal agent constitution v2 (referenced)
├── ecosystem.config.cjs           # PM2 app definitions (§8)
├── config\
│   ├── ports.json                 # Port registry — single source of truth
│   ├── ai-gateway.env             # Gateway URL + unified key (rewritten by self-heal, §12-H)
│   └── plugins\                   # 46 plugin manifests (§6)
├── server\
│   ├── index.ts                   # API entry: 34 register*Routes calls + 67 inline routes
│   ├── rbac.ts                    # Sessions, authenticate, requireRole, KNOWN_USERS
│   ├── types.ts                   # Role union (15 roles), UserSession, SecurityContext
│   ├── db.ts                      # JSON hospital store + audit log (atomic tmp+rename writes)
│   ├── events.ts                  # realtimeHub — SSE broadcast fabric
│   ├── orchestrator.ts            # AstraOrchestrator — brain front door
│   ├── langgraph.ts               # LangGraphOrchestrator — hand-rolled 8-node pipeline
│   ├── centralCore.ts             # "Single brain" LLM entry
│   ├── brain\                     # 15 modules: turnFrame, langGraphMaster (13-node case
│   │                              #   graph), modelRouter (8-tier), privacy (5-class PHI),
│   │                              #   astraBrainFlow, ~25 specialists, secretVault, …
│   ├── routes\                    # 21 route modules (auth vault, hospital, brain, clinical,
│   │                              #   hermes, workorders, monitoring, plugins, …)
│   ├── ai\                        # loadEnv (self-heal), gatewayLink, modelGateway, taskRouter
│   ├── clinical\                  # astra7dEngine + clinical/medical modules
│   ├── services\                  # secrets.ts — AES-256-GCM secret vault
│   └── avatar\                    # Python avatar server (:9000/:8000) — present, unwired
├── src\
│   ├── lib\auth.tsx               # Client RBAC: 13 roles, ROLE_ROUTES/NAV/LABEL, vault login
│   ├── lib\mock.ts                # Client-side mock store (source of SCREEN ONLY risk)
│   ├── sections\                  # Page components (auth/Login, dashboards, workspaces)
│   ├── components\                # Shared UI (AvatarOrb, HypercubeTabs, AstraInternalBrowser…)
│   └── astra\
│       ├── brain\                 # Client brain parts 2–5: explain / follow / mechanism /
│       │                          #   evolution / surgery / value / browser / contacts /
│       │                          #   commands / memory M0–M8 / voicePipeline
│       └── intelligence_extensions\
├── freellmapi\                    # Repo clone of FreeLLMAPI gateway (server\src, .env)
│   └── server\data\               # DEAD — ACL-locked (owner SID from another machine)
├── modules\                       # 16 feature packages (§6)
├── scripts\                       # Launchers; only start-voicebox.cmd present;
│                                #   dr_mayin_langgraph_router.py + start-dr-mayin-router.ps1
│                                #   reference RETIRED port 3001
├── knowledge\                     # RAG / knowledge-base source files
├── reports\                       # Screenshots: astra-preview.png (login),
│                                #   astra-ceo-loggedin.png (CEO deck post-login)
└── data\                          # NOT INSPECTED (protected): hospital.json, auth-vault.json,
                                   #   secrets.json, .secrets-key — existence inferred from code
```

Areas not enumerated above (e.g. `public\`, build output, additional top-level files) were not separately listed and are **UNKNOWN** rather than absent.

---

## 2. Dashboards, Routes & Pages (with Role Permissions & Status)

### 2.1 Routing model

- SPA hash routes; client guard `canAccessRoute(role, path)` in `src\lib\auth.tsx`; server-side enforcement via `authenticate` + `requireRole` (admin bypasses; denials audit-logged).
- 13 client roles: `ceo, doctor, reception, pharmacy, ward, lab, radiotech, ot, supervisor, finance, hr, marketing, admin` (server `Role` union has 15: adds `billing`, `insurance`, `accounts`; client maps `radiology→radiotech`, `billing→finance`).
- Special rules: `/command-center/evolution` restricted to doctor/ceo/admin; `/hospital` and `/intelligence-lab` restricted to ceo/admin; department URLs (`/reception`, `/lab`, …) require the matching staff role.

### 2.2 Route table (47 discovered hash routes)

| # | Route | Page / Component area | Roles (client) | Data source | Status |
|---|---|---|---|---|---|
| 1 | `/ceo` | CEO Command Deck | ceo | API | **WORKS** (runtime screenshot `reports\astra-ceo-loggedin.png`) |
| 2 | `/doctor` | Doctor Cockpit | doctor, ceo | API | STATIC-WIRED |
| 3 | `/command-os` | Doctor Command | doctor | API | STATIC-WIRED |
| 4 | `/command-center` | Command Center | staff roles | API | STATIC-WIRED |
| 5 | `/command-center/evolution` | Evolution view | doctor, ceo, admin | API | STATIC-WIRED |
| 6 | `/command` | Command | ceo, doctor, admin | API | STATIC-WIRED |
| 7 | `/chat` | AI Command (chat) | all roles | Gateway chain | **WORKS** (one completion via FreeLLMAPI observed) |
| 8 | `/comm` | Astra Connect | all (open) | API | STATIC-WIRED |
| 9 | `/copilot` | Co-Pilot | ceo, doctor | Gateway | STATIC-WIRED |
| 10 | `/clinical-ai` | Clinical AI | ceo, doctor, admin | Gateway | STATIC-WIRED |
| 11 | `/clinical` | Clinical | most roles | API | STATIC-WIRED |
| 12 | `/supercore` | Clinical Supercore | most roles | API | STATIC-WIRED |
| 13 | `/emr` | 3D Anatomy EMR | ceo, doctor, admin | API + 3D assets | STATIC-WIRED |
| 14 | `/staff` | Staff Command | ceo, doctor, admin | API | STATIC-WIRED |
| 15 | `/agents` | Agents | ceo, doctor | API | STATIC-WIRED |
| 16 | `/agents/registry` | Agent Registry | ceo, doctor, admin | API | STATIC-WIRED |
| 17 | `/hospital` | Hospital Ops control plane | ceo, admin | API | STATIC-WIRED |
| 18 | `/intelligence-lab` | Intelligence Lab | ceo, admin | API | STATIC-WIRED |
| 19 | `/dashboard` | Dashboard | ceo | API/mock | STATIC-WIRED |
| 20 | `/dashboards` | Dashboards | ceo, doctor | API/mock | STATIC-WIRED |
| 21 | `/knowledge` | Knowledge | ceo, doctor | `knowledge\` | STATIC-WIRED |
| 22 | `/router` | Router Mesh | ceo, admin | API | STATIC-WIRED |
| 23 | `/brain` | Astra Brain (+`?tab=plugins`) | doctor (ceo via plugins link) | API | STATIC-WIRED |
| 24 | `/plugins` | Plugins | ceo, doctor, admin | `config\plugins` | STATIC-WIRED |
| 25 | `/plugin-manager` | Plugin Manager | ceo, doctor, admin | `config\plugins` | STATIC-WIRED |
| 26 | `/health` | System Health | ceo, doctor, admin | API | STATIC-WIRED |
| 27 | `/monitoring` | Monitoring | ceo, doctor, admin | API | STATIC-WIRED |
| 28 | `/reports` | Reports | ceo, doctor, finance, hr, admin | API/mock | STATIC-WIRED |
| 29 | `/audit` | Audit Log | ceo, admin | API (db audit) | STATIC-WIRED |
| 30 | `/settings` | Settings / Login Vault | ceo, doctor | API | STATIC-WIRED |
| 31 | `/setup` | Setup | ceo, doctor, supervisor, admin | API | STATIC-WIRED |
| 32 | `/reception` | Reception Workspace | reception, supervisor (+ceo/doctor/admin) | API | STATIC-WIRED |
| 33 | `/pharmacy` | Pharmacy Workspace | pharmacy (+…) | API | STATIC-WIRED |
| 34 | `/lab` | Laboratory | lab (+…) | API | STATIC-WIRED |
| 35 | `/radiology` | Radiology | radiotech (+…) | API | STATIC-WIRED |
| 36 | `/ward` | Ward & IP Beds | ward (+…) | API | STATIC-WIRED |
| 37 | `/nursing` | Nursing | ward (+…) | API | STATIC-WIRED |
| 38 | `/ot` | OT Workspace | ot (+…) | API | STATIC-WIRED |
| 39 | `/consent` | Consent | clinical roles | API | STATIC-WIRED |
| 40 | `/billing` | Billing | finance, reception, pharmacy (+…) | API | STATIC-WIRED |
| 41 | `/finance` | Finance & Billing | finance (+…) | API | STATIC-WIRED |
| 42 | `/insurance` | Insurance | ceo, doctor, reception, supervisor, finance, admin | API | STATIC-WIRED |
| 43 | `/hr` | HR Workspace | hr (+…) | API | STATIC-WIRED |
| 44 | `/marketing` | Marketing Hub | marketing (+…) | API | STATIC-WIRED |
| 45 | `/admin` | Admin Workspace | admin | API | STATIC-WIRED |
| 46 | `/tasks` | Tasks & Orders | most roles | API | STATIC-WIRED |
| 47 | `/journey` | Patient Journey | most staff roles | API | STATIC-WIRED |
| — | `/notifications` | Notifications | all roles | API | STATIC-WIRED |
| — | `/browser` | Internal Browser | ceo, doctor, admin | iframe/proxy | STATIC-WIRED |
| — | `/ortho-planner` | ASTRA OrthoPlanner | doctor | API + 3D | STATIC-WIRED |
| — | `/bone-recon` | Bone Reconstruction | doctor | API + 3D | STATIC-WIRED |

(Total distinct paths ≈ 51 including the four listed below the table; **47 primary pages** counted in §16.)

### 2.3 Embedded / iframe surfaces

- **AstraInternalBrowser** — `serviceEmbedSrc` mapping to `/proxy/*` endpoints; embeds internal/external services in-page. STATIC-WIRED.
- **Sparta CloudHMS iframe tile** — legacy "Cloud HMS (Sparta)" embed; superseded as Hospital Ops entry point by the Departments view. **REMOVED-LEGACY** (tile retained, no longer default).
- Dead/unreferenced components were identified by the frontend scan (list folded into §15).

### 2.4 Login page

- `src\sections\auth\Login.tsx` — account picker + PIN pad; posts to `/api/auth/vault-login`; forced `MustChangePin` screen when vault flags the account. **WORKS** (end-to-end login observed; screenshot `reports\astra-preview.png`).

---

## 3. Central Doctor Command Centre — Command-to-Dashboard Traces

### 3.1 Surfaces

- `/command-os` "Doctor Command" (doctor nav first item), `/doctor` Doctor Cockpit, `/command-center` (+ restricted `/evolution`), `/command`.

### 3.2 Execution model (static trace)

1. Doctor issues a command (palette / command route) → **`POST /api/command/execute`** (inline route in `server\index.ts`).
2. **Command engine = regex/intent matcher** (not LLM-based): intent patterns map to hospital mutations (admit, order, dispense, assign bed, …). **HALF BUILT** — deterministic subset only; free-text beyond patterns falls through.
3. Mutation passes **workflow guards** (`guardAdmission`, `guardDispense`, `guardOrderStatus`) and, for clinical acts, the **two-layer clinicalApproval gate** (sign-before-act: clinician approval record required before execution).
4. `db.ts` applies the change to the JSON hospital store (atomic write) and appends an audit entry.
5. `events.ts` **realtimeHub** broadcasts over **SSE (`/api/events`)**; subscribed dashboards (ward, pharmacy, OT, billing, CEO deck) refresh live.

Trace status: every hop verified in source = **STATIC-WIRED**; end-to-end runtime exercise of a mutating command: **UNKNOWN** (read-only mandate).

---

## 4. Astra Main Brain & Secondary / Backup Brains

### 4.1 Main brain — `server\brain\*` (15 modules) — STATIC-WIRED

| Module | Role |
|---|---|
| `turnFrame` | Per-turn context assembly |
| `langGraphMaster` | 13-node clinical case graph |
| `modelRouter` | 8-tier model routing |
| `privacy` | 5-class PHI classifier (fail-closed → local models) |
| `astraBrainFlow` | Pipeline: Laya → Hermes → 7D → tools → SSE stream |
| `specialists` | ~25 specialist sub-agents (clinical domains) |
| `secretVault` | Capability refs `vault://`/`env://`, sink allowlist, secret scrubbing (7/7 unit tests passing) |
| `centralCore.ts` (server root) | Single-brain LLM entry |
| `orchestrator.ts` | AstraOrchestrator — front door for brain turns |

### 4.2 Secondary (client) brain — `src\astra\brain` parts 2–5 — STATIC-WIRED

explain / follow / mechanism / evolution / surgery / value / browser / contacts / commands / **memory M0–M8** / voicePipeline. Per the project audit, Part-5 memory is **not read by the clinical turn** (known wiring gap — "connect classed memory to clinical turn by patient id").

### 4.3 Backup / redundant brains

- `server\langgraph.ts` — hand-rolled **8-node LangGraphOrchestrator**. STATIC-WIRED.
- **Five separate LangGraph implementations exist repo-wide** (audit: "three LangGraph implementations" + two more found) → duplication, §15.
- Brain tool cards exist in UI but **do not call the tool executor** (audit item; HALF BUILT).

---

## 5. Agents, Sub-Agents & Orchestration

### 5.1 Declared specialist pool (`AGENTS.md` §1) — 6 agents

Clinical Reasoning (CURB-65/Wells calibration), Medical Evidence (PubMed/ClinicalTrials.gov/RxNav, tiers A–V), Drug Safety & Interaction (RxNorm), Hospital Operations (census/turnaround), Patient Journey, Learning/Skills (versioned, auditable playbooks; cannot modify RBAC/safety/schemas without human authorization).

### 5.2 Brain specialists — ~25 sub-agents in `server\brain` — STATIC-WIRED

### 5.3 External agent systems

| System | Port | Wiring | Status |
|---|---|---|---|
| **Hermes** (CLI) | 9119 | `hermesAdapter` wired; 8 `/api/hermes/*` routes | STATIC-WIRED |
| **Laya** (Python + vendored client) | 8791 | Registered in `config\ports.json`; referenced by astraBrainFlow | STATIC-WIRED |
| **FreeLLMAPI** (LLM gateway) | 31415 | Canonical instance = **desktop app** owning the port; repo clone data dir dead (ACL) | **WORKS** |
| **OmniRoute** (failover router) | 20128 (alias 5171) | In chain config | DOWN at observation |
| **Ollama** (local models) | 11434 | PHI-fail-closed target | DOWN at observation |
| **Mini LLM** `minimind astra-micro` | — | `src\astra` micro-model assets | STATIC-WIRED |
| **OpenClaw** | 18789 | PM2 entry exists; launcher script missing | HALF BUILT |
| **OpenHands** | 8080 / 18000 | PM2 entry; launcher missing | HALF BUILT |
| **Agent Zero** | 5000 | Registered; launcher missing | NOT BUILT (integration) |
| **Paperclip** | 3100 | Registered; launcher missing | NOT BUILT (integration) |
| **Dr Mayin** router | (3001 ref) | `scripts\dr_mayin_langgraph_router.py` partially wired; references **retired port 3001** | HALF BUILT (known breakage) |
| **Scientist** agent | — | Present per audit as working (D1–D7 companion) | STATIC-WIRED |
| **n8n** workflows | 5678 | PM2 entry; config-gated; idempotency test known-failing | HALF BUILT |

### 5.4 LLM call chain

`FreeLLMAPI :31415 (primary) → OmniRoute :20128 (failover) → Ollama :11434 (local)`.
PHI-classified traffic is **fail-closed to local models only** (`taskRouter`, `modelGateway`, `privacy`). `server\ai\gatewayLink.ts` pushes provider keys into gateway DBs; `server\ai\loadEnv.ts` self-heals the unified key at API boot (§12-H). Chain observed working to the first hop (completion from `glm-4.5-flash` via FreeLLMAPI): **WORKS (hop 1)**; failover hops **UNKNOWN**.

---

## 6. Plugins, Books, Skills & Research

| Area | Finding | Status |
|---|---|---|
| Plugin manifests | **46 manifests** in `config\plugins` | STATIC-WIRED |
| Feature modules | **16 packages** in `modules\` | STATIC-WIRED |
| Vendored libs | `cognee`, `laya` vendored in-repo | STATIC-WIRED |
| Book-to-skill | Pipeline converts imported books → skill entries | STATIC-WIRED |
| Scientist skills | Scientist agent skills present | STATIC-WIRED |
| MCP servers | **9 MCP server** integrations configured | STATIC-WIRED |
| n8n | Config-gated; known idempotency test failure | HALF BUILT |
| Knowledge/RAG | `knowledge\` source files + RAG wiring | STATIC-WIRED |
| Anatomy/3D assets | 3D anatomy for EMR/OrthoPlanner/BoneRecon | STATIC-WIRED |
| Clinical calculators | Calculators present | STATIC-WIRED |
| Learning governance | Skills carry ID, semver, authorizing clinician, rationale, rollback (`AGENTS.md` §2) | SPECIFIED (runtime UNKNOWN) |

---

## 7. Voice, Language, Interaction & Gestures

| Component | Detail | Status |
|---|---|---|
| **Voicebox** service | `:17493`, HTTP REST: `/health`, `/transcribe` (Whisper STT), `/speak` (Qwen3-TTS / Kokoro) | **WORKS** (health probe OK; full STT/TTS calls UNKNOWN) |
| STT priority | Voicebox Whisper → browser SpeechRecognition fallback | STATIC-WIRED |
| TTS chain | sarvam → gemini-live → openai-live → voicebox-local → text-only | STATIC-WIRED (Sarvam/Gemini/OpenAI legs are cloud — subject to PHI policy) |
| Wake word | **Regex keyword matching — no ML model** | HALF BUILT |
| Gestures | MediaPipe `tasks-vision` gesture control | STATIC-WIRED |
| Languages | en / hi / te + tenglish / hinglish code-mix handling | STATIC-WIRED |
| Round-trip | mic → STT → brain turn → TTS chain exists (`voicePipeline`) | STATIC-WIRED |
| Avatar server | `server\avatar` Python `:9000`/`:8000` present, **not wired** to UI/API | NOT BUILT (integration) |
| Launcher | `start-voicebox.cmd` — the only present start script | WORKS (service up) |

---

## 8. PM2 & Background Services

### 8.1 `ecosystem.config.cjs` — 7 PM2 apps

| PM2 app | Command (summary) | Port | Runtime at observation |
|---|---|---|---|
| FreeLLMAPI | `tsx freellmapi\server\src\index.ts` | 31415 | Port owned by **desktop app** instead (canonical) — **UP** |
| AstraAPI | `tsx server\index.ts` | 3000 | **UP** |
| OpenClaw | (entry present) | 18789 | UNKNOWN |
| Hermes | (entry present) | 9119 | UNKNOWN |
| Voicebox | (entry present) | 17493 | **UP** |
| n8n | (entry present) | 5678 | UNKNOWN |
| OpenHands | (entry present) | 8080/18000 | UNKNOWN |

### 8.2 `config\ports.json` — 13 registered services

astra-api **3000** · astra-ui **5173** · freellmapi **31415** (3001 **RETIRED**) · omniroute **20128** (5171 alias) · ollama **11434** · voicebox **17493** · hermes **9119** · laya **8791** · openclaw **18789** · openhands **8080/18000** · agent-zero **5000** · paperclip **3100** · n8n **5678** · litellm **4000 (RETIRED)**.

### 8.3 Runtime snapshot (observed 2026-10-09)

UP: API :3000, UI :5173 (Vite dev), FreeLLMAPI :31415, Voicebox :17493.
DOWN: Ollama :11434, OmniRoute :20128.
Not probed (read-only mandate): Hermes :9119, Laya :8791, OpenClaw :18789, OpenHands, Agent Zero :5000, Paperclip :3100, n8n :5678 — **UNKNOWN**.

Note: the canonical FreeLLMAPI is the **desktop application** (SQLite at `%APPDATA%\FreeLLMAPI\freeapi.db`, `freellmapi-` prefixed unified key in its settings table). The repo clone's `freellmapi\server\data` is ACL-locked to another machine's SID — **DEAD/UNKNOWN**.

---

## 9. Hospital Information System (Registration → Discharge)

### 9.1 Store & entities — `server\db.ts` (JSON store `data\hospital.json`, contents not inspected)

Entities: **Patient, Bed, HospitalOrder, PharmacyItem, OTCase, BillingRecord** + audit log. Writes are atomic (tmp + rename). Prior census-math quirk (+107/+28) is **REMOVED-LEGACY** (fixed per audit trail).

### 9.2 API fabric

- 17 `/api/hospital/*` endpoints + department route modules; mutations guarded by `guardAdmission` / `guardDispense` / `guardOrderStatus`; `clinicalApproval` two-layer sign-before-act gate for clinical acts.
- Live propagation via SSE `realtimeHub` (`/api/events`); WS gateway validates `Astra_<role>_<hex>` session tokens (`validateSessionToken`).

### 9.3 Domain flow status

| Domain | Backend | UI | Status |
|---|---|---|---|
| Registration / OPD | Patient endpoints | `/reception`, voice-reg, op-scan subs | STATIC-WIRED |
| Appointments | endpoints | reception subs | STATIC-WIRED |
| Admission / beds | Bed entity + guardAdmission | `/ward`, `/nursing` | STATIC-WIRED |
| Orders (lab/rad/pharm) | HospitalOrder + guardOrderStatus | `/tasks`, dept workspaces | STATIC-WIRED |
| Pharmacy dispense | PharmacyItem + guardDispense | `/pharmacy` | STATIC-WIRED |
| OT | OTCase | `/ot` | STATIC-WIRED |
| Billing / discharge | BillingRecord | `/billing`, `/finance` | STATIC-WIRED |
| Patient journey | journey tracking | `/journey` | STATIC-WIRED |
| Workorders | `/api/workorders/*` | — | **HALF BUILT — RBAC GAP: routes lack `authenticate`** |

Some hospital sub-pages read from `src\lib\mock.ts` (client mock store) — those render but do not persist: **SCREEN ONLY** risk, individually flagged UNKNOWN where not disambiguated.

---

## 10. Clinical Intelligence & Medical Reasoning

| Capability | Implementation | Status |
|---|---|---|
| Clinical Supercore | 12 `/api/…` clinical supercore routes | STATIC-WIRED |
| 13-node case graph | `server\brain\langGraphMaster` | STATIC-WIRED |
| Mechanism ladder / 7D | `server\clinical\astra7dEngine.ts` (§11) | STATIC-WIRED |
| Diagnostic calibration | CURB-65 / Wells (Clinical Reasoning Agent) | SPECIFIED |
| Evidence retrieval | PubMed / ClinicalTrials.gov / RxNav, tiers A–V | SPECIFIED (network egress unverified — UNKNOWN) |
| Drug safety | RxNorm interaction/contraindication screening | SPECIFIED |
| PHI privacy | 5-class classifier; PHI fail-closed to local models | STATIC-WIRED (runtime enforcement UNKNOWN) |
| Approval gate | `clinicalApproval` sign-before-act | STATIC-WIRED |
| Learning loop | clinician corrections → versioned playbooks | SPECIFIED |

---

## 11. Advanced Concepts — 7D / Quantum / 360°

| Concept | Finding | Status |
|---|---|---|
| **7D (Astra 7D, D1–D7)** | Real algorithm + schema: `server\clinical\astra7dEngine.ts` exports `Finding7D`, `MechanismLadder7D`, `synthesize7D`; D1–D7 stages; consumed by `astraBrainFlow` | HALF BUILT→STATIC-WIRED (engine real; runtime UNKNOWN) |
| **Quantum** | **Zero matches** anywhere in repo | **NOT BUILT** |
| **360°** | UI label only (`HypercubeTabs` `map360`) — no 360° computation | **SCREEN ONLY** |

---

## 12. Complete Execution Pipelines (A–J)

| # | Pipeline | Steps (static trace) | Status |
|---|---|---|---|
| **A** | Auth & session | Login.tsx → `POST /api/auth/vault-login` → rate limiter (5 fails → 5-min lock) → scrypt verify (`data\auth-vault.json`, timing-safe) → `createSession` → `Astra_<role>_<hex>` token → Bearer on API + WS | **WORKS** (observed end-to-end) |
| **B** | Clinical brain turn | UI → `orchestrator.ts` → `turnFrame` → `astraBrainFlow`: Laya → Hermes → 7D → tools → SSE tokens → client render | STATIC-WIRED |
| **C** | Order → fulfilment | Command/REST → guards → approval gate → `db.ts` atomic write → audit → SSE broadcast → dept dashboards | STATIC-WIRED |
| **D** | Voice round-trip | mic → Voicebox `/transcribe` (browser fallback) → brain turn → TTS chain (sarvam→gemini→openai→voicebox) → speaker | HALF BUILT (service up; legs static) |
| **E** | LLM failover | FreeLLMAPI → OmniRoute → Ollama; PHI fail-closed local | **WORKS (hop 1)**; hops 2–3 UNKNOWN (both down) |
| **F** | Book-to-skill | book import → parse → skill entry → registry | STATIC-WIRED |
| **G** | Learning governance | clinician correction → playbook (ID/semver/author/rationale/rollback) → audit | SPECIFIED |
| **H** | Gateway key self-heal | API boot → `loadBackendEnv()` (ai-gateway.env → .env → .env.local) → `readFreeLlmUnifiedKey()` from desktop DB → `applyFreeLlmUnifiedKey()` rewrites `config\ai-gateway.env` → 401s auto-fixed | **WORKS** (observed fixing a 401) |
| **I** | Plugin load | `config\plugins` manifest → module wiring → Plugin Manager UI | STATIC-WIRED |
| **J** | Internal browser | `AstraInternalBrowser` → service registry → `/proxy/*` → iframe embed | STATIC-WIRED |

---

## 13. Database, Network, Security & Integrations

### 13.1 Data stores

- `data\hospital.json` — JSON hospital store (atomic writes). Contents not inspected.
- `data\auth-vault.json` — 9 staff accounts; salted **scrypt** PIN hashes (per-code evidence: scryptSync, 24-byte salt, 64-byte hash). A documented starter PIN exists; **value redacted**. `mustChangePin` forces upgrade to ≥6-digit PIN.
- `data\secrets.json` + `data\.secrets-key` — AES-256-GCM secret vault (`server\services\secrets.ts`); presence-listing only, values never logged.
- FreeLLMAPI desktop SQLite `%APPDATA%\FreeLLMAPI\freeapi.db` — gateway keys/models.

### 13.2 Security mechanisms

- `authenticate` (Bearer/cookie/header token, in-memory sessions, 24 h expiry) + `requireRole` (admin bypass; 403 denials audit-logged).
- Login rate limiting (5 failures → 5-minute lockout, HTTP 429).
- `ASTRA_DEV_AUTH_BYPASS=true` + non-production → dev conveniences only; production always 401s unauthenticated requests; bypass attempts audit-logged.
- `brain\secretVault`: `vault://`/`env://` capability references, sink allowlist (prompts are **not** an allowed sink), `scrubSecrets` redaction.
- PHI policy (project rule): patient data only to local models; never log keys or patient text — enforced in code via privacy classifier (runtime enforcement UNKNOWN).
- **Gaps:** `/api/workorders/*` missing `authenticate` (§9.3); two gateway tokens mismatched in repo history (self-healed at boot, §12-H).

### 13.3 Network

SSE (`/api/events`), WS gateway (token-validated), `/proxy/*` service proxy, REST throughout. Ports per §8.2.

### 13.4 External integrations

PubMed, ClinicalTrials.gov, RxNav/RxNorm (evidence/drug agents — egress unverified: UNKNOWN); Sarvam / Gemini Live / OpenAI Live (TTS legs); 9 MCP servers; n8n webhooks; Sparta CloudHMS (legacy iframe).

---

## 14. Exact Replica / Clone Blueprint

1. **Prereqs:** Node.js (v24 observed), npm, Python (Laya/avatar), PM2 (`npm i -g pm2`), Ollama (optional, local models), FreeLLMAPI desktop app (canonical gateway) *or* the repo clone with a writable data dir.
2. **Install:** `npm install` in repo root (and in `freellmapi\` if running the clone); Python deps for Laya/Voicebox per their folders (exact files not inventoried — UNKNOWN).
3. **Config:** copy/create `config\ai-gateway.env` (gateway URL + unified key — value comes from the FreeLLMAPI DB, auto-healed at first API boot); verify `config\ports.json`.
4. **Data:** `data\` must contain `hospital.json`, `auth-vault.json`, `secrets.json`, `.secrets-key` — seed formats were not inspected (protected). A fresh clone must generate the vault + secrets key (code auto-generates the secrets key; auth vault seeding path UNKNOWN).
5. **Start order:** FreeLLMAPI → AstraAPI (:3000) → Vite UI (:5173) → Voicebox → (optional) Ollama, OmniRoute, Hermes, Laya, n8n, OpenClaw, OpenHands. PM2: `pm2 start ecosystem.config.cjs`.
6. **Verify:** `GET :31415/v1/models` 200 → UI login (vault account + PIN) → `#/ceo` renders → chat completion → Voicebox `/health`.
7. **Known repairs to apply (from audit wiring order):** register Laya port (done in ports.json) → remove port-3001 refs in `scripts\dr_mayin_*` → single secret source (done: `services\secrets.ts`) → fix missing security imports (done: `accountVault`, `secretVault`) → connect Part-5 memory to clinical turn → pick ONE LangGraph implementation → connect brain tool cards to tool executor → record real timings (no patient text).

---

## 15. Dead Files, Duplicates & Clean-Copy Candidates

**Candidates only — nothing was removed.**

| Item | Reason | Verdict |
|---|---|---|
| 5× LangGraph implementations | Parallel redundant pipelines (audit: pick one) | DEDUPE CANDIDATE |
| `scripts\dr_mayin_langgraph_router.py`, `start-dr-mayin-router.ps1` | Reference RETIRED port 3001 | REPAIR OR RETIRE |
| `freellmapi\server\data\` | ACL-locked to foreign SID; superseded by desktop-app DB | DEAD DIR (do not copy) |
| Sparta CloudHMS iframe tile | Legacy; replaced by Departments entry | REMOVED-LEGACY |
| litellm :4000, port 3001 | Retired per ports.json | REMOVED-LEGACY |
| Census +107/+28 math | Fixed in `db.ts` | REMOVED-LEGACY |
| `server\avatar` Python (:9000/:8000) | Present, never wired | ORPHAN |
| Missing `start-*.cmd` launchers (all but voicebox) | Launch path absent for OpenClaw/OpenHands/AgentZero/Paperclip | GAP |
| Dead UI components | Unreferenced per frontend scan | CLEAN-COPY EXCLUSIONS |
| Brain tool cards | Render but don't reach tool executor | HALF BUILT |
| Part-5 client memory | Not read by clinical turn | HALF BUILT |
| n8n idempotency test | Known failing | KNOWN BREAKAGE |
| Avatar status enum | Tests expect OFFLINE/READY where REMOVED was returned | KNOWN BREAKAGE (test mismatch) |

---

## 16. Coverage, Evidence, Limitations & Parity Matrix

### 16.1 Evidence base

- **Static:** six parallel read-only explorations (frontend routes; server API/brain/clinical; agents; plugins; voice; hospital workflows) + direct reads of `ports.json`, `ecosystem.config.cjs`, `rbac.ts`, `auth.tsx`, `loadEnv.ts`, `types.ts`, `Login.tsx`.
- **Runtime (same-day observation window):** ports 3000/5173/31415/17493 UP, 11434/20128 DOWN; login end-to-end (screenshots in `reports\`); one FreeLLMAPI chat completion (`glm-4.5-flash`); gateway-key self-heal observed fixing a 401; `brain.spec.ts` 7/7 passing for secretVault.

### 16.2 Limitations

- `data\`, vaults, secrets: not entered (mandate) — all store contents **UNKNOWN**.
- No service was started/stopped for this inventory; most runtime states beyond §16.1 are UNKNOWN.
- `freellmapi\server\data` ACL-locked — unverifiable.
- External egress (PubMed/Sarvam/etc.) not exercised.
- Counts below are discovered/static counts, not runtime-confirmed counts.

### 16.3 Parity matrix (major components)

| Component | Static wiring | Runtime | Verdict |
|---|---|---|---|
| Vault auth & sessions | ✔ | ✔ | **WORKS** |
| API :3000 / UI :5173 / Gateway :31415 / Voicebox :17493 | ✔ | ✔ | **WORKS** |
| Gateway key self-heal | ✔ | ✔ | **WORKS** |
| Secret vaults (`services\secrets`, `brain\secretVault`) | ✔ | ✔ (tests) | **WORKS** |
| CEO deck, login, AI chat pages | ✔ | ✔ | **WORKS** |
| Remaining ~44 dashboards | ✔ | ✗ | STATIC-WIRED |
| Doctor command engine (regex intents) | ✔ | ✗ | HALF BUILT |
| Order flow + SSE fabric | ✔ | ✗ | STATIC-WIRED |
| Main brain (`server\brain` 15) + orchestrator | ✔ | ✗ | STATIC-WIRED |
| Client brain parts 2–5 (memory M0–M8) | ✔ | ✗ | HALF BUILT (Part-5 unwired to clinical turn) |
| 7D engine | ✔ | ✗ | STATIC-WIRED |
| Quantum | ✗ | ✗ | **NOT BUILT** |
| 360° | label | ✗ | **SCREEN ONLY** |
| Hermes / Laya adapters | ✔ | ✗ | STATIC-WIRED |
| OmniRoute / Ollama failovers | ✔ | down | UNKNOWN |
| OpenClaw / OpenHands / Agent Zero / Paperclip | partial | ✗ | HALF BUILT / NOT BUILT |
| Dr Mayin router | partial | ✗ | HALF BUILT (port 3001 breakage) |
| Voice full pipeline (STT/TTS chains) | ✔ | partial | HALF BUILT |
| Avatar python server | ✗ | ✗ | NOT BUILT (integration) |
| Plugins (46) / modules (16) / MCP (9) | ✔ | ✗ | STATIC-WIRED |
| Book-to-skill / learning playbooks | ✔ | ✗ | STATIC-WIRED / SPECIFIED |
| Workorders API | ✔ | ✗ | HALF BUILT (**RBAC gap**) |
| Internal browser `/proxy/*` | ✔ | ✗ | STATIC-WIRED |

### 16.4 Discovery counts

- **Modules (module-level units):** **102** = 21 server route modules + 15 server brain modules + 4 client brain parts + 16 `modules\` packages + 46 plugin manifests.
- **Dashboards / pages:** **47** primary hash-route pages (plus 4 auxiliary: notifications, browser, ortho-planner, bone-recon).
- **Agents:** **42** = 6 declared specialists + ~25 brain specialists + 9 external agent systems (Hermes, Laya, OpenClaw, OpenHands, Agent Zero, Paperclip, Dr Mayin, Scientist, minimind astra-micro) + 2 orchestrators.
- **Services:** **13** registered in `config\ports.json` (7 PM2-managed apps in `ecosystem.config.cjs`).
- **Unverified components (runtime UNKNOWN / static-only):** **56** = 44 runtime-unverified dashboards + 12 major subsystems (command engine, order-flow runtime, main brain runtime, client memory, 7D runtime, Hermes, Laya, OmniRoute/Ollama failovers, voice chains, plugins/MCP runtime, book-to-skill/learning runtime, internal browser proxy).

*End of inventory.*
