# ASTRA Repair Log

Prompt 09 repair pass. No commits were made. No files under `data/`, `.env*`, or secret material were edited.

## Repairs

| Item | Status | Change |
| --- | --- | --- |
| Census math adds fixed `107` and `28` offsets | Already done | `server/db.ts` already uses real outpatient and occupied-bed counts without fixed offsets, so no edit was made for this item. |
| n8n idempotency test fails | Fixed | `server/db.ts` now generates collision-safe order IDs before appending a hospital order. This prevents random reuse of an already-acknowledged order ID and preserves idempotent consumer semantics. |
| Avatar reports `REMOVED` where tests expect `OFFLINE`/`READY` | Fixed | `server/routes/avatar.ts` now reports unavailable avatar speech as `OFFLINE`; A2F status still reports real `READY` only after a live probe. |

## Test Results

| Command | Result |
| --- | --- |
| `powershell -ExecutionPolicy Bypass -File .\scripts\verify-astra.ps1` | PASS, exit 0. `41` total, `40` passed, `0` failed, `1` warning for optional n8n offline. |
| `npx vitest run server/tests/n8nBus.spec.ts` | PASS. `7` tests passed. |
| `npx vitest run server/routes/avatar.spec.ts server/ws/avatarGateway.spec.ts` | PASS. `8` tests passed. |

## Unresolved Blockers

- Optional n8n health remains `WARN` because nothing is listening on `127.0.0.1:5678` during verification. This is an environment/service availability issue, not a code failure.
