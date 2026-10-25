# ASTRA AI — PHASE 2B: AUTHENTIC RUNTIME VERIFICATION + CONSOLE ACCESS REPORT

Date: 2026-08-31
Scope: Prove the REAL runtime behind "Hermes" and "LangGraph" in Astra, prove internal +
external console opening, and STOP before any agent wiring.

---

## 1. FINAL TRUTHFUL CLASSIFICATIONS (PHASE 23)

- **Hermes** → **VERIFIED REAL RUNTIME** (executable + provenance VERIFIED).
  Real execution is currently **CONFIGURATION REQUIRED** at the model level
  (see §5): the configured model fails Hermes' minimum context window. The
  runtime is genuine NousResearch Hermes — this is a model-configuration gap,
  not a fake/placeholder.
- **LangGraph** → **ASTRA CUSTOM ORCHESTRATOR** (NOT the official LangGraph
  runtime). `@langchain/langgraph` is NOT installed and `LangGraphOrchestrator.ts`
  is a project-local in-process DAG engine. It is honestly NOT labelled
  "REAL LANGGRAPH" / "VERIFIED".

Combined enforced state: **REAL RUNTIME FOUND — CONFIGURATION REQUIRED**

One of the exact forms:

| Candidate | Verdict |
|---|---|
| VERIFIED REAL RUNTIME | Hermes runtime identity: YES. Hermes model config: no (context < 64K). |
| REAL RUNTIME FOUND — CONFIGURATION REQUIRED | **SELECTED** for Hermes execution |
| REAL RUNTIME FOUND — INTEGRATION ERROR | — |
| PROVENANCE UNVERIFIED | NO (Hermes provenance was proven) |
| NOT INSTALLED | NO |

---

## 2. HERMES PROVENANCE AUDIT (PHASE 1)

Inspected install:
`C:\Users\mural\AppData\Local\hermes\hermes-agent`
Executable probed:
`C:\Users\mural\AppData\Local\hermes\hermes-agent\venv\Scripts\hermes.exe`

| Fact | Value |
|---|---|
| Version | **Hermes Agent v0.18.2 (2026.7.7.2) · upstream d9ee3424 · local 05b5e2b6** |
| Executable | `...\hermes-agent\venv\Scripts\hermes.exe` (+ `hermes-agent.exe`, `hermes-acp.exe`) |
| Python env | venv, **Python 3.11.15** |
| OpenAI SDK | 2.24.0 |
| Install method | **git** (reported by `hermes --version`) |
| HERMES_HOME | `C:\Users\mural\AppData\Local\hermes` (containing `config.yaml`, `.env`, `state.db`, `sessions/`, `skills/`, `memories/`, `auth.json`) |
| Git remote | `https://github.com/NousResearch/hermes-agent.git` |
| Git HEAD | `05b5e2b6e941eff9c014644eec4a40f6d676afd7` |
| CLI entry points | `hermes chat|model|doctor|status|config|skills|sessions|memory|…` |

`hermes --help` (supported top-level commands, captured from the real binary):
`chat model moa fallback secrets migrate gateway proxy lsp setup postinstall
whatsapp whatsapp-cloud slack send login logout auth status cron webhook portal
kanban project hooks doctor security dump debug backup checkpoints import config
console pairing skills bundles plugins curator pets journey learning memory-graph
memory tools computer-use mcp sessions insights claw version update uninstall acp
profile completion dashboard serve desktop gui logs prompt-size`

One-shot execution mode supported by this version: **`-z/--oneshot`** and
**`chat -q QUERY -Q --safe-mode --max-turns N`** (verified via `chat --help`).

## 3. HERMES ORIGIN PROOF (PHASE 2)

- `git remote -v` -> **origin = https://github.com/NousResearch/hermes-agent.git**
  (matches the official NousResearch repo URL).
- `git rev-parse HEAD` -> `05b5e2b6...` (grafted single-commit checkout of `main`).
- `hermes --version` banner reports install method `git` and upstream/local commits
  (an internal consistency fingerprint, not spoofable by a UI skin).
- Doctor reports "Version files consistent (0.18.2)" and "Virtual environment active".

**Conclusion: PROVENANCE = VERIFIED** (derived from NousResearch/hermes-agent).
Do NOT accept an unrelated repo named "Hermes" — this origin is the canonical one.

---

## 4. HERMES CAPABILITY INSPECTION (PHASE 3) — retained from the real runtime

The installed **v0.18.2** provides (from `--help`): interactive `chat`, model
selection/config, tools & toolsets, skills/skillset management, memory
(provider + memory-graph), sessions, task execution (`send`, `-z/--oneshot`),
configuration (`config`, `setup`), health (`doctor`, `status`), streaming
(`serve`/`dashboard`/`gui`), approval/safety (`pairing`, `safe-mode`), and
checkpoints. The installed version is the source of capability truth; no
invented commands were run.

---
## 5. REAL EXECUTION TEST (PHASE 9) — HONEST RESULT

Ran the real binary directly (non-fabricated):

```
hermes -z "Return a short three-step plan for organizing a non-clinical administrative task." -m qwen3:14b
```

Real output (exit code 1):
> `hermes -z: agent failed: Model qwen3:14b has a context window of 40,960 tokens, which is below the minimum 64,000 required by Hermes Agent.`

This is a **REAL runtime error**, reported truthfully. Root cause:
- `~/.hermes/config.yaml` -> `model: default: qwen3:14b`, `provider: custom`,
  `base_url: http://127.0.0.1:11434/v1` (local Ollama).
- `qwen3:14b` exposes 40,960 tokens of context, below Hermes' required 64,000.

Execution state is therefore **CONFIGURATION_REQUIRED** (model context must be at
least 64K). A successful result is NOT fabricated. The Astra console still works
and clearly communicates this state — console accessibility and runtime
configuration are independent (Phase 6).

Execution record:
`started -> completed(failed, exit 1) · stdout empty · stderr=<context-window error> · result=none · error=<real>`.

---
## 6. LANGGRAPH PROVENANCE AUDIT (PHASES 10-12)

Inspected `src/lib/agents/core/LangGraphOrchestrator.ts`:
- It does **NOT** import `@langchain/langgraph` (or any official LangGraph API).
- It implements a **custom bounded-DAG engine in TypeScript** (nodes, edges,
  checkpoints, approval gates, execution ids). Concurrency/DAG concepts are hand-rolled.
- It does NOT use `StateGraph`, `START`, `END`, `compile`, `checkpoint`,
  `Command`, `stream`, or `interrupt` from any official package.

Verified package facts:
- `package.json`: no `@langchain/langgraph`, no `langgraph`.
- `package-lock.json`: `@langchain/langgraph` occurrences = **0**.
- `node_modules/@langchain`: **absent**; `node_modules/*langgraph*`: none.
- No Python `langgraph` package is used by any orchestrator.

**Classification: ASTRA CUSTOM ORCHESTRATOR** (in-process TypeScript).

Decision (Phase 12): the official `@langchain/langgraph` package was **not added**
in this phase. Rationale: the custom orchestrator's public API
(`startWorkflow`/`routeToAgent`/`completeWorkflow`, `runGraph`,
`approveWorkflowResume`, etc.) is load-bearing for CommandCore and the test
suite. Swapping to the official engine would be a large, high-risk migration
that conflicts with "preserve the existing lockfile" and "do not unnecessarily
upgrade the dependency tree". The label is therefore honest:
**ASTRA CUSTOM ORCHESTRATOR** — never "REAL LANGGRAPH". A future phase may
convert to official `@langchain/langgraph` behind the existing contracts.

---
## 7. INTERNAL + EXTERNAL OPENING (PHASES 5-8, 14-16)

Both services open inside Astra via the Secure Internal Browser
(`src/sections/browser/AstraInternalBrowser.tsx`):

- **Hermes** -> `HermesConsole` (real CLI-backed Astra console; no fake HTTP
  server, no iframe). Truth-based health (`/api/agents/hermes/health`) classifies
  `LIVE / CONFIGURATION_REQUIRED / ERROR / NOT_FOUND`.
- **LangGraph** -> `LangGraphConsole` (in-process orchestrator console; no fake
  localhost endpoint, no iframe).

External opening (new in this phase):
- Home cards now render **`Open in Astra`** and **`Open External`** for
  CLI/in-process console services (Hermes, LangGraph).
- `Open External` opens a **new OS browser tab at the real Astra origin** via a
  non-sensitive deep link `#/browser?service=<id>` (see `externalServiceUrl()`).
  It does NOT open `localhost:<fake-hermes-port>`.
- Direct URL restores the correct console because the launcher opens a console
  tab for `cli`/`in-process` services when `?service=` is present.
- `noopener,noreferrer` is used on every external popup. No tokens or
  credentials are placed in the URL.

---

## 8. RUNTIME PROVENANCE PANEL (PHASE 18)

Added a **Runtime Provenance** panel to both consoles (backed by
`astraServices.ts` provenance metadata):

- **Hermes**: `VERIFIED REAL RUNTIME` · official project
  `NousResearch/hermes-agent` · version `0.18.2` · commit `05b5e2b6...` ·
  install `git + venv` · Python implementation · integrity `VERIFIED`.
- **LangGraph**: `ASTRA CUSTOM ORCHESTRATOR` · official project
  `langchain-ai/langgraph` · package `N/A (@langchain/langgraph not installed)` ·
  implementation `TypeScript (in-process)` · integrity `ASTRA-CUSTOM`.

Truthful labels per Phase 17 are used (`REAL RUNTIME` only where verified).

---

## 9. SECURITY (PHASE 20)

- No API keys / provider credentials / session secrets are exposed in any
  console; Hermes secrets (`auth.json`, API keys) are never shown.
- All external windows use `noopener,noreferrer`.
- Deep links carry only the non-sensitive service id.
- Hermes console APIs are behind server RBAC
  (`authenticate`, `requireRole(["doctor","admin","ceo"])`).

---

## 10. NOT WIRED (PHASE 21) — STOPPED

No agent-to-agent wiring was started. Hermes<->LangGraph, OpenClaw, Paperclip,
n8n, hospital/clinical integrations, model routing, FreeLLMAPI, and OmniRoute
were **not modified**.

---
## 11. REAL TEST MATRIX (PHASE 22)

### HERMES
| Test | Result |
|------|--------|
| Official provenance | **PASS** — `NousResearch/hermes-agent.git`, commit `05b5e2b6` |
| Real executable | **PASS** — `venv/Scripts/hermes.exe` |
| Version | **v0.18.2 (2026.7.7.2)** |
| Hermes help | **PASS** — full command surface enumerated |
| Hermes doctor/health | **PASS** — `doctor` OK; health API truth-based |
| Real task execution | **CONFIG REQUIRED** — model context 40K < required 64K (real error) |
| Astra Console | **PASS** — `HermesConsole` |
| Open in Astra | **PASS** |
| Open External | **PASS** (new) — real Astra-origin deep link |
| Direct external URL | **PASS** — `#/browser?service=hermes` |
| Ctrl+F5 | **PASS** — same console restored |

### LANGGRAPH
| Test | Result |
|------|--------|
| Official package provenance | **FAIL (honest)** — no `@langchain/langgraph` installed |
| Official package installed | **FAIL (honest)** — absent from package.json/lock/node_modules |
| Real graph execution | **PARTIAL** — executes via Astra custom in-process DAG (NOT official LangGraph) |
| State | **PASS** (Astra custom engine) |
| Approval | **PASS** (Astra custom human-approval gate) |
| Checkpoint | **PASS** (Astra custom checkpoint) |
| Astra Console | **PASS** — `LangGraphConsole` |
| Open in Astra | **PASS** |
| Open External | **PASS** (new) — real Astra-origin deep link |
| Direct external URL | **PASS** — `#/browser?service=langgraph-orchestrator` |
| Ctrl+F5 | **PASS** — same console restored |

LangGraph is presented as **ASTRA CUSTOM ORCHESTRATOR**, never as the official
LangGraph runtime.

---
## 12. FILES CHANGED (PHASE 24)

Files changed:
- `src/services/astraServices.ts` — added `provenance` metadata to the registry
  (Hermes = VERIFIED; LangGraph = ASTRA-CUSTOM).
- `src/sections/browser/AstraInternalBrowser.tsx` —
  - `externalServiceUrl()` helper (real Astra-origin deep link),
  - `ProvenancePanel()` UI component,
  - home cards now render `Open in Astra` / `Open External` for console services,
  - direct-URL launcher opens console tabs for CLI/in-process services,
  - inserted provenance panels into Hermes + LangGraph consoles.
- `PHASE_2B_RUNTIME_VERIFICATION.md` — this report (new).

Files not changed:
`server/index.ts`, `server/agents/hermesAdapter.ts`, `server/langgraph.ts`,
`src/lib/agents/core/LangGraphOrchestrator.ts`,
`src/lib/agents/core/HermesBrain.ts`, `src/astra/agents/hermes.ts`,
`package.json`, `package-lock.json`, `src/App.tsx`, `src/lib/hashRoute.ts`,
`src/lib/browserSecurity.ts`.

Packages added: **NONE** (official `@langchain/langgraph` intentionally not added — see section 6).
Packages removed: **NONE**.
Ports changed: **NONE** (single existing Astra origin reused; no fake ports created).
Services reinstalled: **NONE** (Hermes installation is genuine; not replaced).

---

## 13. REQUIRED FOLLOW-UP TO MAKE HERMES EXECUTE (NEXT PHASE)

To move Hermes from `CONFIGURATION_REQUIRED` to `LIVE`, select a model with at
least 64K context in `~/.hermes/config.yaml` (or raise `context_length` to the
model's true window), e.g. `qwen3:32b`, `qwen3:64b`, or an OpenAI/NIM-compatible
model with >=64K context. This is a Hermes configuration concern and was NOT
changed in Phase 2B.
---