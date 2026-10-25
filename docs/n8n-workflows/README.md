# n8n Workflows — ASTRA Hospital Event Bus

`order-lab.workflow.json` implements the golden-path contract for
`POST /webhook/order-lab`. **The workflow is LIVE and ACTIVE** on the
hospital n8n instance (workflow id `qkku8l9M5eZdaCEs`).

## Status (verified live 2026-09-12)

- Instance: `http://127.0.0.1:5678` — healthz `200`
- **ACTIVE workflow**: `ASTRA — Lab Order Bus (order-lab)`
- **Golden path: PASS** — `200 { ok, status:"ACKNOWLEDGED", orderId, idempotencyKey, receivedAt, acknowledgedAt, uhid, patientId, correlationId }`
- Reliability: duplicate webhook (same key) handled · resubmit (new key) accepted · missing `idempotencyKey` → **400 CONTRACT_VIOLATION**
- Client trigger verified: `npx tsx scripts/n8n-live-probe.ts` (Astra's real `n8nTrigger`)
- 9+ successful executions on workflow id `qkku8l9M5eZdaCEs` (from `/api/v1/executions`)

## Config

`.env`: `N8N_API_KEY=<key>` (Settings → n8n API), `VITE_N8N_BASE` / `N8N_BASE_URL=http://127.0.0.1:5678`.

## Re-import (if n8n data is ever reset)

1. n8n → Workflows → Import from File → `order-lab.workflow.json`
2. Toggle Active.
3. Or run `scripts/n8n-import.mjs`-equivalent with the API key (see session notes).

## Contract (enforced in the workflow)

- Requires `idempotencyKey` (idempotent consumer — at-least-once delivery) → else **400**
- Responds `200 { ok, status:"ACKNOWLEDGED", ...receivedAt/acknowledgedAt }`
- State flow supported: `CREATED→SENT→RECEIVED→ACKNOWLEDGED→IN_PROGRESS→COMPLETED`

## Other bus endpoints (live, same pattern)

`/webhook/critical-alert` ✅ ACTIVE · `/webhook/notify-team` ✅ ACTIVE —
both verified (`ok=true status=200` by `scripts/n8n-golden-path-e2e.ts`).
`/webhook/order-radiology`, `/webhook/discharge-prep`, `/webhook/bed-request`
can be added from the same template when needed (see
`src/astra/integrations/n8nClient.ts` AUTOMATIONS list).

## Server-side acknowledgement pipeline (this increment)

`server/integrations/n8nBus.ts`:
- `fireAutomation(name, payload)` — server-side trigger (call-time env read,
  NO fake success)
- `handleLabOrderAck(payload)` — **idempotent consumer** recording
  `ACKNOWLEDGED` + `acknowledgedAt/ackSource/correlationId/idempotencyKey` on
  the canonical `HospitalOrder` (additive statuses `sent|received|acknowledged|in_progress`)
- Routes: `POST /api/hospital/n8n/order-ack` · `GET /api/hospital/n8n/status`
- Regression: `server/tests/n8nBus.spec.ts` (6/6) — golden ack, idempotent
  re-delivery, conflicting ack refused, unknown order refused, contract fail-closed

Full live proof: `npx tsx scripts/n8n-golden-path-e2e.ts` (real DB order →
bus → ACKNOWLEDGED → persisted status).
