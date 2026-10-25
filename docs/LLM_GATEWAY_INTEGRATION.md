# LLM Gateway Integration: OmniRoute + FreeLLMAPI

Canonical topology is **one Astra brain**: see `docs/ASTRA_CENTRAL_AI_ADAPTER.md`.

```
Astra AI CORE (policy / safety / memory)
        │
Central AI Adapter  http://127.0.0.1:3000/v1
        │
   PRIMARY FreeLLMAPI :3001/v1
   FALLBACK OmniRoute :5171/v1
   LOCAL    Ollama    :11434/v1
```

Hermes, LangGraph, OpenClaw, Paperclip, and n8n call the adapter. They do not each host a model. Manus stays on the Manus cloud API.

Legacy OmniRoute-as-front-door diagram (still how OmniRoute itself fans out):

```
Astra backend (Hermes + Paperclip agents)
        │  OpenAI-compatible calls (base URL + key from env)
        ▼
OmniRoute  ── native: http://127.0.0.1:5171/v1  (dashboard same port /home)
           └── Docker: http://127.0.0.1:20129/v1 (dashboard :20128)
        │  custom OpenAI-compatible provider
        ▼
FreeLLMAPI ── http://127.0.0.1:3001/v1   (Vite dashboard :5170/models/chat)
        │  provider keys (Groq, Gemini, etc. — free tiers)
        ▼
Upstream model providers
```

Both projects are standalone git clones (own `.git`), not submodules — they are
never committed into Astra's history; only the compose file, env examples and
this doc are tracked.

## 1. One-time setup

```powershell
# env files (both repos need one before docker compose will start)
copy freellmapi\.env.example freellmapi\.env
copy OmniRoute\.env.example  OmniRoute\.env
```

Edit `OmniRoute\.env` and **uncomment/set** these — required so OmniRoute may
call a loopback provider (its SSRF guard blocks private URLs by default):

```
OMNIROUTE_ALLOW_PRIVATE_PROVIDER_URLS=true
OMNIROUTE_ALLOW_LOCAL_PROVIDER_URLS=true
```

## 2. Start the stack

```powershell
docker compose -f docker-compose.llm.yml --profile base up -d
```

- FreeLLMAPI API: http://127.0.0.1:3001 — Vite dashboard: http://127.0.0.1:5170
  (create the first account, add free-tier provider keys, then create a
  **unified API key** on Dashboard → API Keys). Production/static fallback
  can also serve the built SPA from the Express process on :3001.
- OmniRoute native dashboard: http://127.0.0.1:5171/home — set the admin
  password. Docker compose uses upstream defaults :20128 / :20129.

Health endpoints: FreeLLMAPI `GET /api/ping`; OmniRoute has its own compose
healthcheck.

## 3. Register FreeLLMAPI as an OmniRoute provider

OmniRoute → **Dashboard → Providers → add custom / OpenAI-compatible provider**:

| Field | Value |
|---|---|
| Base URL | `http://freellmapi:3001/v1` (container-to-container) or `http://127.0.0.1:3001/v1` when running OmniRoute natively (not in Docker) |
| API key | the FreeLLMAPI **unified key** |
| Auth style | Bearer / OpenAI-compatible |

When OmniRoute runs in Docker, use the service hostname `freellmapi` — the
compose `include:` puts both stacks on the same network. OmniRoute auto-
discovers the model list from the provider's `/v1/models`.

## 4. Wire Astra's backend

Copy `config/llm-gateway.env.example` values into your backend env
(`.env.local` / process env):

```
ASTRA_LLM_GATEWAY_BASE_URL=http://127.0.0.1:5171/v1
ASTRA_LLM_GATEWAY_API_KEY=<OmniRoute client API key>
ASTRA_LLM_GATEWAY_MODEL=<model id, e.g. freellm/groq-llama...>
ASTRA_FREELLMAPI_BASE_URL=http://127.0.0.1:3001/v1   # optional, direct use
ASTRA_FREELLMAPI_API_KEY=<FreeLLMAPI unified key>    # optional, direct use
```

Agents (Hermes, Paperclip, clinical agents, …) should send OpenAI-compatible
requests to `ASTRA_LLM_GATEWAY_BASE_URL` with `Authorization: Bearer
$ASTRA_LLM_GATEWAY_API_KEY`. OmniRoute then handles routing, fallback and
compression; FreeLLMAPI fans out to the free provider pools.

## 5. Local (non-Docker) development

```powershell
# FreeLLMAPI — Node >= 20.18
cd freellmapi; npm install; npm run dev          # server :3001 + client
# OmniRoute
cd OmniRoute; npm install; npm run dev           # native Astra: PORT=5171 (dashboard + /v1)
```

Then in OmniRoute use `http://127.0.0.1:3001/v1` as the provider base URL.

## Notes & gotchas

- FreeLLMAPI binds to `127.0.0.1` by default in Docker (`HOST_BIND`) — safe.
  To reach it from the LAN set `HOST_BIND=0.0.0.0` in `freellmapi/.env`
  (trusted networks only; it is a single-user proxy).
- FreeLLMAPI rate-limits `/v1` at 120 req/min per client IP by default
  (`PROXY_RATE_LIMIT_RPM`); raise it if OmniRoute retries under load.
- Both stacks store state in named volumes / `OmniRoute/data`; migrations for
  FreeLLMAPI run via `npm run db:migration:up` inside its server workspace.
- Submodules: if you later want the clones tracked in the Astra repo:
  `git submodule add https://github.com/tashfeenahmed/freellmapi freellmapi`
  (and likewise for diegosouzapw/OmniRoute).
