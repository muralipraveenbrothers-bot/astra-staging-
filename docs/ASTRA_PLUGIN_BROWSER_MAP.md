# ASTRA Plugin + Internal Browser Map

Prompt 05 wiring keeps the Internal Browser API-first: service reads/actions use registered APIs or tool handlers first, while embedded pages are visualization surfaces. UI automation remains unsupported unless a service lacks an API.

| Service | Primary Duty | Health | API / Actions | Permissions | Tool Handlers | Fallback | Browser Destination |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FreeLLMAPI | Main AI model gateway | `/api/ping` on `127.0.0.1:31415` | read models, health, proxy completion | `service:*` gateway permissions | `aiGatewayChat` | OmniRoute, then Ollama | `http://127.0.0.1:31415/` |
| OmniRoute | Secondary model router | `/v1/models` on `127.0.0.1:20128` | read models, health, route completion | `service:*` routing permissions | `omniRouteGateway` | Ollama | `http://127.0.0.1:20128/home` |
| Laya | Fast local decision brain | `/v1/health` on `127.0.0.1:8791` | urgency, language, department routing | local clinical routing permissions | `decidePackSync` | deterministic Saarathi intent rules | `http://127.0.0.1:8791` |
| Cognee | Memory bridge | `/v1/health` on `127.0.0.1:8792` | health only currently wired | memory permissions | unsupported | classed local memory path | `http://127.0.0.1:8792` |

Browser intents supported by the brain parser: `OPEN_SERVICE`, `OPEN_PATIENT_VIEW`, `OPEN_DOCUMENT`, `READ_SERVICE_STATUS`, `SEARCH_INTERNAL`, `SEARCH_EXTERNAL`, `BACK`, `FORWARD`, `REFRESH`, `CLOSE`, and `HEALTH`.

Brain tool cards now call the existing executor only after Tool Registry role and approval checks pass. Unsupported cards return an explicit `"This card has no hospital executor."` denial instead of inventing behavior. Tool action traces record tool ids, executor ids, role, approval result, and input keys only; patient text is not recorded.
