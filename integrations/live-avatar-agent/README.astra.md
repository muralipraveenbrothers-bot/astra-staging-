# Live Avatar Agent — pinned reference (commit `ef187345`, 2026-06-05)

Source: https://github.com/wukath/live-avatar-agent-demo

Google ADK + Gemini Live avatar demo. Used by Astra ONLY as a **presentation /
streaming provider** through `server/integrations/live-avatar/adapter.ts`.

Reusable concepts (per the repo):

- `live_avatar_agent/agent.py` — ADK agent with `AvatarConfigPlugin`
  (avatar modality request, e.g. `Kai` / `Cora`).
- `live_avatar_agent/avatar_client.html` — glassmorphic WebSocket/MediaSource
  live client (bidirectional audio/video streaming).
- WebSocket live-session architecture (HTTP session creation + WS live
  endpoint on the ADK web server, default `:8000`).

**Not used by Astra (deliberately):**

- `DiscoveryEngineSearchTool`, `roll dice`, `check prime numbers` — demo tools,
  never clinical tools.
- The demo's own `Kai`/`Cora` personalities as clinical identities.

Astra's browser transport is its OWN gateway (`ws://<host>/ws/avatar`) which
drives the real A2F blendshape path. This upstream is pinned here as a
reference + optional remote presentation service when `LIVE_AVATAR_ENABLED=true`
and `LIVE_AVATAR_BASE_URL` point at a running ADK server.

No LICENSE file is shipped in this upstream tree; the README references Apache
licensing.