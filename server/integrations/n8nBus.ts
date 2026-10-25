/**
 * ASTRA AI — SERVER-SIDE N8N HOSPITAL BUS (server/integrations/n8nBus.ts)
 * ============================================================================
 * Server-side counterpart of src/astra/integrations/n8nClient.ts:
 *   fireAutomation(name, payload)  → POST /webhook/<name> on the hospital n8n
 *   handleLabOrderAck(payload)     → record ACKNOWLEDGED on the canonical
 *                                    HospitalOrder (idempotent consumer)
 *   registerN8nBusRoutes(app)      → POST /api/hospital/n8n/order-ack
 *
 * NO FAKE SUCCESS: an unreachable/unconfigured n8n yields an honest failure
 * (never a simulated "dispatched"). At-least-once delivery is made safe by
 * the idempotencyKey on the meaningfully-once consumer (db.recordOrderAck).
 */

import { Express, Request, Response } from "express";
import { db } from "../db";
import { realtimeHub } from "../events";

/** Resolve the hospital-bus base URL at CALL time (testable, no stale consts). */
export function n8nBusBase(): string {
  return process.env.N8N_BASE_URL || process.env.VITE_N8N_BASE || "";
}

export interface BusTriggerResult {
  ok: boolean;
  automation?: string;
  status?: number;
  detail: string;
  response?: unknown;
}

/**
 * Fire a hospital-bus automation. Honest on every path:
 *   unconfigured → CONFIG_REQUIRED · unreachable → BUS_UNREACHABLE
 *   non-2xx     → HTTP <status> · 2xx        → fired with body echo
 */
export async function fireAutomation(
  name: string,
  payload: Record<string, unknown>,
): Promise<BusTriggerResult> {
  const base = n8nBusBase();
  if (!base) {
    return { ok: false, automation: name, detail: "CONFIG_REQUIRED: N8N_BASE_URL unset — not dispatched." };
  }
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${base}/webhook/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, source: "astra-server", at: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return { ok: false, automation: name, detail: `BUS_UNREACHABLE: ${e instanceof Error ? e.message : String(e)}` };
  }
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  if (!res.ok) {
    return { ok: false, automation: name, status: res.status, detail: `n8n returned ${res.status}`, response: body };
  }
  return { ok: true, automation: name, status: res.status, detail: `Automation "${name}" fired`, response: body };
}

// ---------------------------------------------------------------------------
// Lab order acknowledgement handling (golden-path state: …→ACKNOWLEDGED)
// ---------------------------------------------------------------------------

export interface OrderAckPayload {
  orderId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  receivedAt?: string;
  acknowledgedAt?: string;
  ackSource?: string;
}

export type OrderAckOutcome =
  | { ok: true; order: { id: string; status: string; patientId: string; uhid: string; acknowledgedAt: string; idempotent: boolean } }
  | { ok: false; code: "CONTRACT_VIOLATION" | "ORDER_NOT_FOUND" | "CONFLICTING_ACK"; detail: string };

/** Idempotent consumer for Lab acknowledgements. FAIL CLOSED on unknown/conflicting. */
export function handleLabOrderAck(payload: OrderAckPayload): OrderAckOutcome {
  const idempotencyKey = payload.idempotencyKey?.trim();
  const orderId = payload.orderId?.trim();
  if (!idempotencyKey && !orderId) {
    return { ok: false, code: "CONTRACT_VIOLATION", detail: "idempotencyKey (or orderId) required." };
  }
  if (!idempotencyKey) {
    return { ok: false, code: "CONTRACT_VIOLATION", detail: "idempotencyKey required — at-least-once delivery needs an idempotent consumer." };
  }
  if (!orderId) {
    return { ok: false, code: "ORDER_NOT_FOUND", detail: "orderId required to locate the HospitalOrder." };
  }
  const recorded = db.recordOrderAck(orderId, {
    idempotencyKey,
    acknowledgedAt: payload.acknowledgedAt ?? new Date().toISOString(),
    receivedAt: payload.receivedAt,
    ackSource: payload.ackSource ?? "n8n-order-lab",
    correlationId: payload.correlationId,
  });
  if (!recorded) {
    const nf = db.getOrders().find((o) => o.id === orderId);
    if (nf) {
      return { ok: false, code: "CONFLICTING_ACK", detail: `Order ${orderId} already acknowledged with a different idempotencyKey.` };
    }
    return { ok: false, code: "ORDER_NOT_FOUND", detail: `Order "${orderId}" does not exist in the hospital fabric.` };
  }
  return {
    ok: true,
    order: {
      id: recorded.order.id,
      status: recorded.order.status,
      patientId: recorded.order.patientId,
      uhid: recorded.order.uhid,
      acknowledgedAt: recorded.order.acknowledgedAt!,
      idempotent: recorded.idempotent,
    },
  };
}

// ---------------------------------------------------------------------------
// Timeline + Doctor notification on successful acknowledgement
// ---------------------------------------------------------------------------

/**
 * Write the Patient Timeline (audit) entry and broadcast the Doctor Command
 * Centre notification. Called by the webhook callback route (and E2E path)
 * AFTER handleLabOrderAck succeeds — keeps the pure idempotent-consumer
 * function side-effect-free for unit tests.
 */
export function notifyOrderAck(outcome: Extract<OrderAckOutcome, { ok: true }>): {
  auditId: string;
  eventId: string;
} {
  const audit = db.logAudit({
    actorId: "n8n-order-lab",
    actorName: "n8n Lab Order Bus",
    actorRole: "system",
    action: "LAB_ORDER_ACKNOWLEDGED",
    category: "hospital-bus",
    status: "SUCCESS",
    details: `Order ${outcome.order.id} ACKNOWLEDGED by Lab (ackSource n8n) ${outcome.order.acknowledgedAt}; idempotent=${outcome.order.idempotent}`,
    patientId: outcome.order.patientId,
  });

  const event = realtimeHub.broadcast({
    type: "ORDER_ACKNOWLEDGED",
    targetRoles: ["doctor", "admin"],
    payload: {
      orderId: outcome.order.id,
      patientId: outcome.order.patientId,
      uhid: outcome.order.uhid,
      status: outcome.order.status,
      acknowledgedAt: outcome.order.acknowledgedAt,
      idempotent: outcome.order.idempotent,
      source: "n8n-order-lab",
    },
  });

  return { auditId: audit.id, eventId: event.id };
}

// ---------------------------------------------------------------------------
// Routes — webhook callback target (n8n → Astra)
// ---------------------------------------------------------------------------

export function registerN8nBusRoutes(app: Express): void {
  app.post("/api/hospital/n8n/order-ack", (req: Request, res: Response) => {
    const outcome = handleLabOrderAck((req.body ?? {}) as OrderAckPayload);
    if (!outcome.ok) {
      const status = outcome.code === "CONTRACT_VIOLATION" ? 400 : outcome.code === "CONFLICTING_ACK" ? 409 : 404;
      return res.status(status).json(outcome);
    }
    // Patient Timeline + Doctor Command Centre SSE notification
    const notification = notifyOrderAck(outcome);
    return res.status(200).json({ ...outcome, notification });
  });

  app.get("/api/hospital/n8n/status", (_req: Request, res: Response) => {
    const total = db.getOrders().length;
    const acknowledged = db.getOrders().filter((o) => o.status === "acknowledged").length;
    res.json({
      configured: Boolean(n8nBusBase()),
      baseUrl: n8nBusBase() || null,
      ordersTotal: total,
      ordersAcknowledged: acknowledged,
      contract: "idempotencyKey required — at-least-once delivery, meaningfully-once consumer",
    });
  });
}