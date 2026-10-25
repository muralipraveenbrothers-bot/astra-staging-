# Astra AI — Optional Upstream Integrations

Controlled integration area (Phase 2 §6 / §8 / §9). Each subdirectory is a
**pinned reference copy** of an upstream repository used ONLY through adapters
in `server/integrations/`. Astra never imports these trees at runtime — the
adapters talk to optionally-configured external services over HTTP. Astra's
clinical brain remains the single source of truth; these are presentation /
voice providers.

| Subdirectory | Upstream | Pinned commit | License |
|---|---|---|---|
| `live-avatar-agent/` | https://github.com/wukath/live-avatar-agent-demo | `ef187345` (2026-06-05) | none shipped upstream (Apache per README) |
| `linly-talker/` | https://github.com/Kedreamix/Linly-Talker | `dc831b3e` (2026-02-10) | MIT © 2024 Kedreamix (`linly-talker/LICENSE`) |

Adapters (implemented in `server/integrations/`):

- `linly-talker/adapter.ts` — `linlyHealth()`, `linlyCapabilities()`, `linlyTts()`.
  Maps to the REAL upstream endpoints (`POST /tts_response/`,
  `POST /talker_response/`, `POST /tts_change_model/`). No `/health` or `/asr`
  exist upstream, so the adapter reports them truthfully rather than inventing.
  Endpoints: `LINLY_ENABLED`, `LINLY_BASE_URL`.
- `live-avatar/adapter.ts` — `liveAvatarHealth()`, `liveAvatarCapabilities()`,
  `liveAvatarStartSession()`. Presentation-only: it NEVER invokes the demo
  agent's LLM/tools (DiscoveryEngineSearch, dice/prime, Kai/Cora). Endpoints:
  `LIVE_AVATAR_ENABLED`, `LIVE_AVATAR_BASE_URL`, `LIVE_AVATAR_APP_NAME`,
  `LIVE_AVATAR_USER`.

REST surface mounted by `server/integrations/integrationRoutes.ts`:

```
GET  /api/integrations
GET  /api/integrations/linly
POST /api/integrations/linly/tts
GET  /api/integrations/live-avatar
GET  /api/integrations/live-avatar/health
```

Both integrations are OPTIONAL. With either disabled, Astra continues fully
(clinical brain, hospital ops, A2F, voice) and reports them as `configured:
false` — never as connected.