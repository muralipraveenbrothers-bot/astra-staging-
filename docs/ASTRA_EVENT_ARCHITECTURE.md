# ASTRA Event Architecture

ASTRA now has a small typed in-process event bus at `src/astra/events/astraEventBus.ts`.
It is intentionally transport-neutral so it can later move to an outbox, SSE, or WebSocket
transport without changing callers.

## Envelope

Every event uses `AstraEventEnvelope`:

- `eventId`, `correlationId`, `causationId`, `timestamp`
- `source`, `target`, `eventType`
- optional `patientRef`, optional `encounterId`
- `actorId`, `actorRole`
- `privacyClass`, `riskClass`
- object `payload`
- `schemaVersion`

Risk classes are `R0` read, `R1` draft, `R2` reversible write, `R3` consequential write,
and `R4` critical.

## Bus Contract

The bus exposes `publish`, `subscribe`, `request`, `reply`, and `health`.
`request`/`reply` preserve `correlationId`; replies set `causationId` to the request event id.

## Flight Recorder Boundary

The bus records event metadata at publish time with `payloadRedacted: true`. Raw payloads are not
stored in the trace by default, keeping PHI out of the flight recorder.

## Registries

The existing tool registry remains canonical for hospital executors. `listAstraTools()` exposes
the shared ASTRA contract fields: id, name, primary duty, schemas, risk class, allowed roles,
privacy classes, timeout, retry policy, health check, and handler.

The existing internal service registry now describes browser/plugin-facing service capabilities:
service id, name, primary duty, URL, type, health endpoint, API/embed capability, and permissions.
