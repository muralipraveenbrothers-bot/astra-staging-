# ASTRA AI HOSPITAL OS — Central AI Adapter

Do **not** give each runtime its own model:

```
Doctor
  Hermes     its own model
  Paperclip  its own model
  OpenClaw   its own model
  n8n        its own model
  LangGraph  its own model
  Astra      another model
```

That creates multiple independent brains and inconsistent answers.

## Topology

```
                         ASTRA AI HOSPITAL OS
                                 │
                           ASTRA AI CORE
              Command / Policy · Clinical Safety · Memory / Context
                                 │
                         CENTRAL AI ADAPTER
                      http://127.0.0.1:3000/v1
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
           PRIMARY            FALLBACK         LOCAL FALLBACK
          FreeLLMAPI          OmniRoute            Ollama
         :3001/v1             :5171/v1           :11434/v1
```

Astra is the command center. Connected systems are workers:

```
ASTRA
  |
  v
ASTRA AI ADAPTER   http://127.0.0.1:3000/v1
  |
  +---- FreeLLMAPI = PRIMARY LLM GATEWAY
  +---- OmniRoute  = SECONDARY/FALLBACK
  +---- Ollama     = LOCAL/PRIVATE FALLBACK
  +---- Manus      = EXTERNAL SPECIALIST AGENT/API   (cloud, not FreeLLMAPI)
  +---- Hermes     = PLANNING/REASONING WORKER
  +---- LangGraph  = WORKFLOW ORCHESTRATOR
  +---- Paperclip  = TASK/AGENT EXECUTION
  +---- OpenClaw   = TOOL/AGENT EXECUTION
```

Dispatch: `POST /api/ai/dispatch { input, worker? }`
Clinical workflow: `POST /api/ai/clinical-workflow`
Capabilities: `GET /api/capabilities` (does not replace existing authenticated `/api/services` install manager)
Hospital mutations stay on `POST /api/command/execute`. Workers cannot admit, prescribe, or order.

## Component roles

| Component | Role in Astra | FreeLLMAPI? |
|---|---|---|
| Hermes | Planning / reasoning / tool agent | Yes, via Astra `/v1` (OpenAI-compatible) |
| LangGraph | Clinical / workflow orchestration | Yes (in-process `centralAiChat`) |
| Paperclip | Agent / task execution | Astra gateway where supported (`OPENAI_BASE_URL`) |
| OpenClaw | Tool / agent execution | Yes; `api: "openai-completions"`, `baseUrl`, `apiKey` |
| n8n | Automation / workflow bus | Workflows call Astra `/v1` |
| Manus | External research / agent worker | **No** — Manus cloud API |
| Ollama | Private / local model | Astra local fallback only |

## Hermes context window

Hermes Agent requires **≥ 64,000** tokens (`MINIMUM_CONTEXT_LENGTH` in `agent/model_metadata.py`).

The adapter **must not** reconnect Hermes to a model whose runtime metadata is below that window.

Discovered on this machine (live, not assumed):

- Hermes was configured as `qwen3:14b` / `custom:ollama-local`.
- Hermes `context_length_cache.yaml` recorded **40,960** for `qwen3:14b`.
- Ollama `/api/tags` currently has `qwen2.5:1.5b` (**32,768**) and `bge-m3` (embedding **8,192**). **`qwen3:14b` is not installed.**
- FreeLLMAPI `/v1/models` advertises `auto` with **1,048,576** context and `available: true`.

Reconnect path is therefore:

`Hermes → Astra /v1 → FreeLLMAPI model=auto (context 1,048,576 ≥ 64,000)`

Never set `context_length: 64000` on `qwen3:14b` to paper over the gate.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/models` | OpenAI-compat catalog with discovered `context_length` |
| POST | `/v1/chat/completions` | OpenAI-compat chat (policy + safety + failover) |
| GET | `/api/ai/architecture` | Topology + workers + Hermes gate |
| GET | `/api/ai/workers` | Worker roster (command center view) |
| POST | `/api/ai/dispatch` | Route a non-mutating job to a worker |
| GET | `/api/ai/catalog` | Live model metadata |
| POST | `/api/ai/adapters/apply` | `{ confirm: true }` writes Hermes/OpenClaw provider configs **only if** a ≥64K model was discovered |

Apply always writes a timestamped `.bak.astra-*` next to the live config.
