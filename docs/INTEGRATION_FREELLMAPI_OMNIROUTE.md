# Astra AI — FreeLLMAPI + OmniRoute Integration

## 1. Repositories & versions

| Component | Repository | Clone location (isolated, own `.git`) | Branch |
|---|---|---|---|
| FreeLLMAPI | https://github.com/tashfeenahmed/freellmapi | `d:\astra PM\freellmapi` (run-local mirror: `data/services/freellmapi/source`) | `main` |
| OmniRoute | https://github.com/diegosouzapw/OmniRoute | `d:\astra PM\OmniRoute` | `release/v3.8.51` |

Both clones are standalone git checkouts (not submodules, not committed into
Astra's history). Verify the exact pinned commit at any time:

```powershell
git -C freellmapi rev-parse HEAD
git -C OmniRoute  rev-parse HEAD
```

## 2. Architecture

```
Astra AI (React 18 + Vite frontend, Express 5 backend on :3000)
│
├── Existing Astra AI features (unchanged: RBAC, plugins, agents, EMR, …)
│
├── AI Provider / Routing layer
│     ├── src/config/aiKeys.ts                     key registry + overrides
│     ├── src/components/AIRouterSettings.tsx      settings UI
│     ├── server/services/serviceManager.ts        lifecycle (start/stop/health)
│     ├── server/services/serviceRegistry.ts       endpoint/status resolution
│     └── server/router.ts                         model/provider routing
│
├── FreeLLMAPI  API :3001  + Vite dashboard :5170
└── OmniRoute   :5171  (native: dashboard HTML + /v1 + /api, one process)
        └── Docker compose still uses upstream defaults :20128 / :20129
```

- The **Vite dev server** proxies same-origin paths (no CORS, no exposed keys):
  `/proxy/freellmapi/** → 127.0.0.1:3001`, `/proxy/omni/** → 127.0.0.1:5171`
  (`vite.config.ts`).
- The **backend** manages both as internal services (`server/services/*`,
  `ServiceId = "freellmapi" | "omniroute"`). Health: FreeLLMAPI `GET /api/ping`,
  OmniRoute `GET /health`.
- Failure-safe: if either service is down, Astra starts normally and the UI
  shows an "offline" panel in the plugin console; all existing providers
  (Gemini/OpenAI/Ollama/Moonshot adapters) continue to work.
- Routing priority is unchanged by default; OmniRoute is used only when
  `ASTRA_LLM_GATEWAY_BASE_URL` is configured, with explicit fallback to
  existing Astra providers.


## 3. Installation & startup

One-time: `copy freellmapi\.env.example freellmapi\.env` and
`copy OmniRoute\.env.example OmniRoute\.env`; in `OmniRoute/.env` set
`OMNIROUTE_ALLOW_PRIVATE_PROVIDER_URLS=true` (lets OmniRoute reach a loopback
FreeLLMAPI; its SSRF guard blocks private URLs by default).

Docker (recommended):

```powershell
docker compose -f docker-compose.llm.yml --profile base up -d
```

Native dev (Node ≥ 20.18): `cd freellmapi && npm install && npm run dev` and
`cd OmniRoute && npm install && npm run dev`.

Full procedure, provider registration, and gotchas: see
`docs/LLM_GATEWAY_INTEGRATION.md`.

## 4. Configuration / environment variables

`config/llm-gateway.env.example` (copy values into `.env.local`):

| Variable | Purpose |
|---|---|
| `ASTRA_LLM_GATEWAY_BASE_URL` | OmniRoute OpenAI-compatible API (`http://127.0.0.1:5171/v1` native; Docker default `:20129/v1`) |
| `ASTRA_LLM_GATEWAY_API_KEY` | OmniRoute client key |
| `ASTRA_LLM_GATEWAY_MODEL` | Model id to request through the gateway |
| `ASTRA_FREELLMAPI_BASE_URL` | Direct FreeLLMAPI endpoint (optional) |
| `ASTRA_FREELLMAPI_API_KEY` | FreeLLMAPI unified key (optional, direct use) |
| `OMNIROUTE_ALLOW_PRIVATE_PROVIDER_URLS` / `OMNIROUTE_ALLOW_LOCAL_PROVIDER_URLS` | OmniRoute → loopback FreeLLMAPI |

No API keys are hard-coded anywhere in Astra source. FreeLLMAPI's own
`ENCRYPTION_KEY` is generated into the encrypted store
(`data/services/secrets.enc.json`) by its service manager, never committed in
plain text. Users may also set keys at runtime via the AI Router settings UI
(`AIRouterSettings.tsx`, stored per-browser in `localStorage`).

## 5. UI & command integration

- Plugin Center routes: `#/plugins/freellm` (`FreeLLMPlugin.tsx`) and
  `#/plugins/omniroute` (`OmniRoutePlugin.tsx`) — embedded, same-origin
  consoles with enable/status/logs via `ManagedServiceConsole`; no separate UI
  was created.
- Commands flow through Astra's existing command engine / central command
  router (`src/astra/runtime/centralCommand.ts`, plugin registry) — no
  duplicate command system was added.
- Live UI verification script: `node scripts/verify_plugins_embedded.mjs`.

## 6. Dependencies added to Astra AI

**None.** Astra's `package.json` was not modified. FreeLLMAPI and OmniRoute
keep their own manifests inside their isolated clones, so there are no
dependency or version conflicts with Astra.

## 7. Files changed / added in Astra AI (integration only)

- `vite.config.ts` — `/proxy/freellmapi` and `/proxy/omni` dev proxies
- `docker-compose.llm.yml` — chained gateway stack
- `config/llm-gateway.env.example` — gateway env template
- `server/services/*` — service manager/registry/types for the two services
- `src/sections/plugins/FreeLLMPlugin.tsx`, `OmniRoutePlugin.tsx`,
  `ManagedServiceConsole.tsx` — embedded consoles
- `src/App.tsx` — two route cases
- `src/config/aiKeys.ts`, `src/components/AIRouterSettings.tsx` — key settings
- `docs/LLM_GATEWAY_INTEGRATION.md`, this document

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Plugin shows "FreeLLMAPI is Offline" | Start the stack (§3); check `http://127.0.0.1:3001/api/ping` |
| OmniRoute refuses loopback provider | Set `OMNIROUTE_ALLOW_PRIVATE_PROVIDER_URLS=true` in `OmniRoute/.env` |
| 429s under load | Raise `PROXY_RATE_LIMIT_RPM` in `freellmapi/.env` (default 120 req/min/IP) |
| Compose won't start | Both `.env` files must exist first (§3) |

## 9. Rollback procedure

1. `docker compose -f docker-compose.llm.yml --profile base down` (stops the gateways).
2. Remove the two `case` branches in `src/App.tsx` and the proxy blocks in `vite.config.ts`.
3. Delete `docker-compose.llm.yml`, `config/llm-gateway.env.example`, and the two plugin route files.
4. The clone directories (`freellmapi/`, `OmniRoute/`) can simply be deleted —
   they are fully isolated from Astra source. No Astra dependency or existing
   provider code ever depended on them at build time.
