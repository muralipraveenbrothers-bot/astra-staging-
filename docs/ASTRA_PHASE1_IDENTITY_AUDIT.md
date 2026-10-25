# ASTRA AI — PHASE 1 ACCOUNT / IDENTITY AUDIT

**Date:** 2026-09-02  
**Scope:** Identity and authentication state of every named service.  
**Method:** Config/env/source inspection + SQLite identity-table counts + live port probes.  
**Rules followed:** No fake accounts created. No API keys invented. No secrets printed. No auth bypass. No agent-to-hospital-data wiring.

Live status below is from probes on 2026-09-02. Config state is from files on disk.

---

## Executive snapshot

| Service | Role in target architecture | Identity state | Live now |
|---|---|---|---|
| **Astra Central Command** | Authority | Demo PIN + static server tokens. No real user directory. | **UP** (Vite :5173, API :3000) after this session started it |
| **FreeLLMAPI** | Model backbone | SQLite `users=0`, `api_keys=0`, `sessions=0`. First dashboard account **not registered**. A unified inference key **is auto-seeded in DB settings** (not copied into Astra env). | **DOWN** (not listening :3001 at first probe; Astra later tried auto-start) |
| **OmniRoute** | Model backbone router | `.env` exists. `INITIAL_PASSWORD=CHANGEME` (placeholder). `API_KEY_SECRET` empty. `REQUIRE_API_KEY=false`. No user DB in `OmniRoute/data`. | **DOWN** at first probe |
| **Ollama** | Local models | **No auth.** Two models installed. | **UP** `:11434` |
| **Hermes** | Autonomous worker | Official CLI installed. Config points at local Ollama. `auth.json` has one NVIDIA credential in the pool; `active_provider` is **empty**. Hermes `.env` has **no uncommented API keys**. | CLI present; **no HTTP listener** |
| **Paperclip** | Workforce control plane | Local instance at `%USERPROFILE%\.paperclip\instances\default` (onboarded 2026-07-20). Loopback `:3100`, signup **not** disabled. Instance JWT secret **SET**. Clone `.env` still missing. | **DOWN** `:3100` |
| **Astra Clinical Graph** | Stateful workflow | In-process. No service identity. Inherits caller session. | Code only |
| **n8n** | Automation bus | Binary on PATH. DB has a stub owner row (**no email**, `userActivated=false`, `isInstanceOwnerSetUp=false`). 0 workflows, 0 credentials, 0 webhooks, 0 API keys. | **DOWN** `:5678` |
| **Manus** | Cloud specialist | Plugin only. `secrets: []`. No `MANUS_*` env. Not a logged-in cloud client. | N/A (no local daemon) |
| **Voicebox** | Voice I/O | Local exe present. `data/voicebox.db` has **no user table**. Cloud TTS keys **not set**. | **DOWN** `:17493` (exe installed) |
| **23 specialist agents** | Internal domain specialists | Registry IDs only. Inherit Astra session (or default doctor). No agent accounts. | In-process when API is up |

**Astra cannot authenticate to FreeLLMAPI, OmniRoute, n8n, Paperclip, Manus, or Voicebox as a named client today.** Loopback reachability is the only control for Ollama / Voicebox / n8n webhooks.

---

## 1. Astra Central Command (this repo)

### 1.1 Client identity (UI)

| | |
|---|---|
| **Mechanism** | Mock PIN login (`src/lib/auth.tsx`, `src/sections/auth/Login.tsx`) |
| **Store** | Hardcoded `ACCOUNTS` array + `localStorage` (`astra.accounts`, `astra.session`) |
| **Credentials** | 15 demo staff accounts with 4-digit PINs **in source** (not hashed) |
| **Password / IdP** | None |
| **Auto-login** | If no saved session, AuthProvider can session as `dr-murali` without a PIN |

Client roles: `ceo`, `doctor`, `reception`, `pharmacy`, `ward`, `lab`, `radiotech`, `ot`, `supervisor`, `finance`, `hr`, `marketing`, `admin`.

### 1.2 Server identity (API)

| | |
|---|---|
| **Mechanism** | Bearer / `x-Astra-token` / `?role=` (`server/rbac.ts`) |
| **Store** | In-memory `Map`. Seeded static tokens: `doctor-token`, `admin-token`, … |
| **Login** | `POST /api/auth/login` accepts `{ role, name }` — **no password** |
| **Unauthenticated requests** | `authenticate()` **defaults to `doctor-token`** |
| **Frontend binding** | PIN session **does not** mint a server token. Several UIs send hardcoded `Bearer doctor-token`. |

Server roles: `doctor`, `reception`, `pharmacy`, `lab`, `radiology`, `ward`, `ot`, `hr`, `billing`, `insurance`, `accounts`, `ceo`, `admin`.

### 1.3 Astra env (this process)

| File | State |
|---|---|
| `.env` | **MISSING** |
| `.env.local` | **EXISTS** (37 bytes). Only `VITE_N8N_BASE=http://127.0.0.1:5678` |
| `.env.local.example` | Gateway + TTS keys **commented / empty** |
| Process env `ASTRA_LLM_GATEWAY_API_KEY` | **UNSET** |
| Process env `ASTRA_FREELLMAPI_API_KEY` | **UNSET** |
| Process env `VITE_GEMINI_API_KEY` / TTS / OpenAI | **UNSET** |

`src/config/aiKeys.ts` `FREELLM_PREMIUM` is a **placeholder** (`freellmapi-x…`).  
`src/lib/store.tsx` default `freellmApiKey` is a **hardcoded string in source** (not printed here). Treat as leaked-in-source until rotated into env.

`data/hospital.json` is clinical/ops data, **not** a user directory.  
`data/services/secrets.enc.json` exists (ciphertext only); contains a sealed `freellmapi.ENCRYPTION_KEY`, not staff identity.

### 1.4 Identity gaps (Astra)

1. No real user directory (no hashed passwords, no IdP, no SQLite users).
2. Client session ≠ server session.
3. Unauthenticated API becomes doctor.
4. Role dictionaries diverge (client / server / `PermissionRegistry`; `"nurse"` is used in some `requireRole` lists but is not a server `Role`).
5. Docs (`RBAC.md`) describe JWT + zero client bypass; implementation is static tokens + default doctor.

---

## 2. Model backbone

### 2.1 FreeLLMAPI

| | |
|---|---|
| **Location** | `D:\astra PM\freellmapi` (+ plugin copy `config/plugins/freellm-provider`) |
| **Auth** | Dashboard: first email+password via setup while `users` empty. Inference `/v1`: unified key or client-profile keys. |
| **`.env`** | Exists (copy of example). `ENCRYPTION_KEY` = **PLACEHOLDER**. No `ADMIN_EMAIL` / `ADMIN_PASSWORD`. |
| **Identity DB** | `config/plugins/freellm-provider/data/freeapi.db` — `users=0`, `api_keys=0`, `sessions=0`, `client_profiles=0`, `url_tokens=0`. Catalog seed present (`models=328`). Settings include auto-seeded `unified_api_key` (**SET**, length recorded only; value not copied here and **not** present in Astra env). |
| **Astra client key** | **EMPTY** in env. Placeholder in `aiKeys.ts`. |
| **Registration required?** | **Yes** — first dashboard account has not been created. Do not auto-create it. Do not treat the DB-seeded unified key as an Astra integration until an operator pastes it into env. |

### 2.2 OmniRoute

| | |
|---|---|
| **Location** | `D:\astra PM\OmniRoute` (start scripts). Copies under `modules/` and `config/plugins/omniroute-gateway/`. |
| **Auth** | Dashboard management password from `INITIAL_PASSWORD`. `/v1` gated by `REQUIRE_API_KEY`. |
| **`.env` (canonical)** | `INITIAL_PASSWORD` = **PLACEHOLDER `CHANGEME`**. `API_KEY_SECRET` = **EMPTY**. `REQUIRE_API_KEY=false` (value length 5). Loopback-provider flags **COMMENTED** (SSRF still blocks FreeLLMAPI on loopback until enabled). |
| **Data** | `OmniRoute/data` has cache only — **no user SQLite** in that tree. |
| **Astra client key** | `ASTRA_LLM_GATEWAY_API_KEY` **EMPTY**. |
| **Registration required?** | Dashboard password must be set by operator (not `CHANGEME`). Do not invent one. |

Port split: docs/docker use **20128/20129**; Astra native proxy and some start scripts use **5171**.

### 2.3 Ollama

| | |
|---|---|
| **Auth** | **None.** |
| **Live** | `LISTEN :::11434` process `ollama`. `GET /api/tags` HTTP 200. |
| **Models present** | `qwen2.5:1.5b`, `bge-m3:latest` |
| **Hermes configured model** | `qwen3:14b` at `http://127.0.0.1:11434/v1` — **not in the installed model list** |
| **Astra → Ollama** | Unauthenticated HTTP / Vite `/proxy/ollama` |

---

## 3. Hermes (autonomous worker)

| | |
|---|---|
| **Install** | `%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts\hermes.exe` **exists** |
| **Home** | `%LOCALAPPDATA%\hermes` — `config.yaml`, `auth.json`, `.env`, `state.db` exist |
| **Configured provider** | `provider: custom`, `base_url: http://127.0.0.1:11434/v1`, `default: qwen3:14b` |
| **auth.json** | `active_provider` **EMPTY**. One `credential_pool.nvidia` entry exists (`auth_type` SET, `secret_fingerprint` SET, `last_status` EMPTY). Values not printed. |
| **Hermes `.env`** | 191 commented assignment lines; **0** uncommented KEY/TOKEN/SECRET/API lines. |
| **Astra wiring** | `server/agents/hermesAdapter.ts` **spawns CLI** (`hermes chat -q … --safe-mode`). No Hermes HTTP server. |
| **In-app “Hermes”** | Separate in-process mock/localStorage loops (`src/agents/core/HermesBrain.ts`, `src/astra/agents/hermes.ts`) — **not** the CLI identity |
| **Astra credentials for Hermes** | None. |

Hermes is a **local CLI identity**, not an Astra user. It is **not** authorized to mutate hospital data except through CommandEngine with a human session.

---

## 4. Paperclip (workforce control plane)

| | |
|---|---|
| **Official clone** | `D:\sahastra ai\external\paperclip` (outside Astra git). Start: `start-paperclip.cmd` → port **3100** |
| **Clone `.env`** | **MISSING**. `.env.example` has **placeholder** Better Auth / signing secrets. |
| **Local instance** | `%USERPROFILE%\.paperclip\instances\default` exists. `config.json` source=`onboard` (2026-07-20). `server.bind=loopback`, `port=3100`, `auth.disableSignUp=false`, `deploymentMode=local_trusted`. Embedded Postgres data dir present. Instance `.env` has `PAPERCLIP_AGENT_JWT_SECRET` **SET**. |
| **Astra in-process “Paperclip”** | `src/astra/agents/paperclip.ts` — IndexedDB RAG, **no** Paperclip account |
| **Astra → Paperclip** | Vite `/proxy/paperclip` → `:3100` with **no credential injection** |
| **Live** | **DOWN** |

Two products share the name. Official Paperclip has a local onboarded instance, but it is **not running** and Astra has **no registered client identity** for it. Owner-user rows inside embedded Postgres were not queried (would require the DB password; not printed/used).

---

## 5. Astra Custom Clinical Graph

| | |
|---|---|
| **Mechanism** | In-process: `server/langgraph.ts`, `src/agents/core/LangGraphOrchestrator.ts`, `src/astra/runtime/centralCommand.ts`, `src/lib/knowledge/graph.ts` |
| **Identity** | Graph state carries `UserSession` from the caller. No service account. |
| **Store** | In-memory graph + `data/hospital.json` + localStorage outcomes |
| **Auth to hospital data** | Must remain CommandEngine + RBAC. **Not wired as autonomous agent-to-DB.** |

---

## 6. n8n

| | |
|---|---|
| **Start** | `start-n8n.cmd` — `N8N_HOST=127.0.0.1`, port 5678, `N8N_SECURE_COOKIE=false`. **No** `N8N_USER` / `N8N_PASSWORD` / `N8N_BASIC_AUTH_*` |
| **Binary** | On PATH (`%APPDATA%\npm\n8n.ps1`) |
| **Identity store** | `%USERPROFILE%\.n8n\database.sqlite` **exists**. `user` rows=1: UUID present, **email/name NULL**, `disabled=0`, `roleSlug=global:owner`, `userActivated=false`. Setting `userManagement.isInstanceOwnerSetUp=false`. `user_api_keys=0`, `workflow_entity=0`, `credentials_entity=0`, `webhook_entity=0`. Config `encryptionKey` **SET** (not printed). |
| **Astra client** | `VITE_N8N_BASE` set. `n8nTrigger()` POSTs JSON **without Authorization**. Plugin schema `apiKey` default `""` |
| **Live** | **DOWN** `:5678` |
| **Registration required?** | **Yes** — owner setup is **not complete**. Do not create the owner account from this audit. |

---

## 7. Manus

| | |
|---|---|
| **What exists** | P4 plugin `config/plugins/manus-executor-addon/manifest.json` — local step planner/executor |
| **Cloud** | Card points at `https://manus.im`. No `MANUS_API_KEY`. Manifest `secrets: []` |
| **Identity** | Astra RBAC claim `manus:execute` only. **Not** a Manus cloud login |

Do not treat this plugin as a connected Manus account.

---

## 8. Voicebox

| | |
|---|---|
| **Install** | `%LOCALAPPDATA%\voicebox\voicebox-server.exe` **exists** |
| **Start** | `start-voicebox.cmd` → `127.0.0.1:17493` |
| **Astra DB** | `data/voicebox.db` — audio/profiles tables; **no users**. `profiles=0`, `mcp_client_bindings=0` |
| **Cloud TTS keys** | ElevenLabs / Google / OpenAI **not in `.env.local`** |
| **Astra client** | Unauthenticated HTTP to loopback / `/proxy/voicebox` |
| **Live** | **DOWN** |

---

## 9. The 23 specialist agents

Canonical seed: `src/agents/core/AgentRegistry.ts` (23 records).  
`docs/ASTRA_AGENT_REGISTRY.md` is a stub.  
A second, smaller list exists in `src/lib/agents/config/AstraAgentRegistry.ts`.

| # | agentId | Level |
|---|---|---|
| 1 | `hermes_brain` | CORE |
| 2 | `langgraph_orchestrator` | CORE |
| 3 | `validator_agent` | CORE |
| 4 | `hospital_query_agent` | SPECIALIST |
| 5 | `patient_context_agent` | SPECIALIST |
| 6 | `command_agent` | MANAGER |
| 7 | `clinical_reasoning_agent` | SPECIALIST |
| 8 | `evidence_agent` | SPECIALIST |
| 9 | `image_agent` | SPECIALIST |
| 10 | `voice_agent` | SPECIALIST |
| 11 | `clinical_copilot_agent` | SPECIALIST |
| 12 | `susruta_clinical_superbrain` | SPECIALIST |
| 13 | `clinical_blind_spot_agent` | SPECIALIST |
| 14 | `mitra_wellness_agent` | SPECIALIST |
| 15 | `molecular_cascade_agent` | SPECIALIST |
| 16 | `surgical_roadmap_agent` | SPECIALIST |
| 17 | `vent_brain` | SPECIALIST |
| 18 | `tox_command` | SPECIALIST |
| 19 | `op_margin_optimizer` | MANAGER |
| 20 | `pragnya_coordinator` | CORE |
| 21 | `bio_sim_engine` | SPECIALIST |
| 22 | `cerebellum_filter` | CORE |
| 23 | `shield_guardian` | CORE |

**Identity model:** in-process `agentId` + permission strings. No accounts, no API keys.  
`POST /api/agents/invoke` sits behind `authenticate` (which currently defaults to doctor).

Implemented but **not** in the 23-seed: `TraumaIntelligenceAgent`, `IntegrativeMedicineAgent`.

`src/agents/specialists/` also has 21 class files; that folder is **not** 1:1 with the registry seed.

---

## 10. Controlled-integration blockers (identity only)

Do **not** proceed to unrestricted agent-to-agent wiring. These identity gates are still open:

1. **Astra has no production identity.** Demo PINs + default-doctor API.
2. **FreeLLMAPI has zero users and zero stored provider keys.** First-account setup is operator work.
3. **OmniRoute password is still `CHANGEME`; API key not required.**
4. **Astra gateway env keys are empty** — Astra is not a registered client of OmniRoute or FreeLLMAPI.
5. **Hermes default model `qwen3:14b` is not installed in Ollama** (only `qwen2.5:1.5b` + `bge-m3`).
6. **Paperclip, n8n, Voicebox, Manus** have no Astra service credentials.
7. **n8n webhooks from Astra are unauthenticated.**
8. **Clinical Graph / specialists must not gain a private path to `hospital.json` / CommandEngine.**

---

## 11. Next phases (not done)

- **Phase 2 — API contracts:** OpenAPI/health/auth headers per service, only after identity is claimed by a human operator.
- **Phase 3 — Central Command design:** mediated calls (Astra → gateway → model; Astra → n8n webhook with explicit auth; Hermes/Paperclip as workers behind CommandEngine). No autonomous hospital mutation.

Operator actions required before those phases (this audit will **not** perform them):

- Create the FreeLLMAPI first dashboard account yourself.
- Set a real OmniRoute management password (not `CHANGEME`).
- Paste unified / client API keys into Astra env (not source).
- Complete n8n and Paperclip first-run UIs if those products will be used.
- Rotate the hardcoded FreeLLMAPI key string out of `src/lib/store.tsx`.
