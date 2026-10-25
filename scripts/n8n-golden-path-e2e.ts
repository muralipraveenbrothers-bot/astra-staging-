/**
 * ASTRA AI — COMPLETE LIVE GOLDEN PATH (n8n bus, end-to-end)
 * ============================================================================
 *  Doctor: "Order CBC and CRP for ICU Bed 3."
 *  1. Live DB patient resolution (ICU Bed 3 → P001 / UHID-7821)
 *  2. Real HospitalOrder created in the canonical fabric
 *  3. Server bus fires the order-lab webhook (real n8n)
 *  4. Lab ACKNOWLEDGED returned by n8n
 *  5. Server idempotent consumer records ACKNOWLEDGED + provenance on the order
 *  6. notify-team / critical-alert buses probed live
 * Run: npx tsx scripts/n8n-golden-path-e2e.ts
 */
import { readFileSync } from "fs";
for (const line of readFileSync("d:/astra PM/.env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main(): Promise<void> {
  const { db } = await import("../server/db");
  const { resolvePatientContext } = await import("../server/patient/patientContext");
  const { fireAutomation, handleLabOrderAck, notifyOrderAck } = await import("../server/integrations/n8nBus");

  // 1. Real patient resolution
  const ctx = resolvePatientContext("ICU Bed 3");
  console.log("1.PATIENT:", ctx.patientId, ctx.mrn, ctx.patientName, ctx.admissionStatus);

  // 2. Real order in the fabric
  const order = db.createOrder({
    patientId: ctx.patientId,
    patientName: ctx.patientName,
    uhid: ctx.mrn,
    category: "laboratory",
    item: "CBC + CRP",
    priority: "routine",
    orderedBy: "USR-DOCTOR",
  });
  const idempotencyKey = `IDEM-${order.id}`;
  const correlationId = `COR-${order.id}`;
  console.log("2.ORDER: created", order.id, "status", order.status);

  // 3. Fire the hospital bus
  const fired = await fireAutomation("order-lab", {
    event: "ORDER_LAB", orderId: order.id, patientId: ctx.patientId, uhid: ctx.mrn,
    patientName: ctx.patientName, bed: "ICU-03", ward: "Intensive Care Unit",
    tests: ["CBC", "CRP"], priority: "routine", idempotencyKey, correlationId,
  });
  console.log("3.BUS:", JSON.stringify(fired));
  if (!fired.ok) throw new Error("bus fire failed: " + fired.detail);

  // 4-5. Idempotent consumer records the ack on the real order
  const ack = handleLabOrderAck({
    orderId: order.id, idempotencyKey, correlationId,
    acknowledgedAt: (fired.response as { acknowledgedAt?: string })?.acknowledgedAt,
    ackSource: "n8n-order-lab",
  });
  console.log("4.ACK:", JSON.stringify(ack));
  const persisted = db.getOrders().find((o) => o.id === order.id)!;
  console.log("5.PERSISTED: status=", persisted.status, "ackAt=", persisted.acknowledgedAt, "ackSource=", persisted.ackSource);

  // 6. Re-delivery → idempotent no-op
  const redelivery = handleLabOrderAck({ orderId: order.id, idempotencyKey, correlationId, ackSource: "n8n-order-lab" });
  console.log("6.REDELIVERY: idempotent=", redelivery.ok && (redelivery as { order: { idempotent: boolean } }).order.idempotent);

  // 7. Other buses
  for (const name of ["notify-team", "critical-alert"]) {
    const r = await fireAutomation(name, { idempotencyKey: `IDEM-${name}`, uhid: ctx.mrn, message: "live probe" });
    console.log(`7.${name.toUpperCase()}: ok=${r.ok} status=${r.status}`);
  }

  // 8. Patient Timeline (audit) + Doctor notification (SSE broadcast)
  if (ack.ok) {
    const { auditId, eventId } = notifyOrderAck(ack);
    const timeline = db.getAuditTrail(20).find((a) => a.id === auditId);
    console.log("8.TIMELINE: entry=", timeline ? `${timeline.action} ${timeline.patientId} ${timeline.status}` : "MISSING", "| SSE event=", eventId);
  }
}

main().catch((e) => {
  console.error("E2E_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});