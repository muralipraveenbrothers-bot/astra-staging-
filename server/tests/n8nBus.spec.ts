/**
 * ASTRA AI — HOSPITAL BUS (n8n) ACK PIPELINE TESTS (next-step increment)
 * ============================================================================
 * Exercises the REAL canonical fabric (db.createOrder + db.recordOrderAck)
 * through handleLabOrderAck: golden-path state flow into "acknowledged",
 * idempotent re-delivery, conflicting ack refusal, unknown-order refusal.
 * The fabric file is snapshotted and restored so the suite stays disk-safe.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "astra-n8n-"));
const DB_FILE = path.join(TEMP_DIR, "hospital.json");
const WORK_ORDERS_FILE = path.join(TEMP_DIR, "work-orders.json");
const PROFILE_FILE = path.join(TEMP_DIR, "hospital_profile.json");
const AUDIT_FILE = path.join(TEMP_DIR, "audit.jsonl");
let db: typeof import("../db").db;
let handleLabOrderAck: typeof import("../integrations/n8nBus").handleLabOrderAck;
let fireAutomation: typeof import("../integrations/n8nBus").fireAutomation;
let notifyOrderAck: typeof import("../integrations/n8nBus").notifyOrderAck;

beforeAll(async () => {
  fs.copyFileSync(path.join(DATA_DIR, "hospital.json"), DB_FILE);
  fs.copyFileSync(path.join(DATA_DIR, "work-orders.json"), WORK_ORDERS_FILE);
  if (fs.existsSync(path.join(DATA_DIR, "hospital_profile.json"))) {
    fs.copyFileSync(path.join(DATA_DIR, "hospital_profile.json"), PROFILE_FILE);
  } else {
    fs.writeFileSync(PROFILE_FILE, "{}\n", "utf8");
  }
  process.env.ASTRA_DATA_DIR = TEMP_DIR;
  process.env.ASTRA_HOSPITAL_DB_PATH = DB_FILE;
  process.env.ASTRA_HOSPITAL_PROFILE_PATH = PROFILE_FILE;
  process.env.ASTRA_WORK_ORDERS_DB_PATH = WORK_ORDERS_FILE;
  process.env.ASTRA_AUDIT_PATH = AUDIT_FILE;
  ({ db } = await import("../db"));
  ({ handleLabOrderAck, fireAutomation, notifyOrderAck } = await import("../integrations/n8nBus"));
});

afterAll(() => {
  delete process.env.ASTRA_DATA_DIR;
  delete process.env.ASTRA_HOSPITAL_DB_PATH;
  delete process.env.ASTRA_HOSPITAL_PROFILE_PATH;
  delete process.env.ASTRA_WORK_ORDERS_DB_PATH;
  delete process.env.ASTRA_AUDIT_PATH;
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

function makeLabOrder(): { orderId: string; uhid: string } {
  const patient = db.getPatientById("P001");
  if (!patient) throw new Error("live fabric has no P001");
  const order = db.createOrder({
    patientId: patient.id,
    patientName: patient.name,
    uhid: patient.uhid,
    category: "laboratory",
    item: "CBC",
    priority: "routine",
    orderedBy: "USR-DOCTOR",
  });
  return { orderId: order.id, uhid: patient.uhid };
}

describe("hospital bus: lab order acknowledgement (golden path)", () => {
  it("acknowledges a real order → status acknowledged + provenance recorded", () => {
    const { orderId, uhid } = makeLabOrder();
    expect(db.getOrders().find((o) => o.id === orderId)!.status).toBe("pending");

    const out = handleLabOrderAck({
      orderId,
      idempotencyKey: `IDEM-${orderId}`,
      correlationId: `COR-${orderId}`,
      acknowledgedAt: "2026-09-12T15:00:00.000Z",
      receivedAt: "2026-09-12T15:00:00.000Z",
      ackSource: "n8n-order-lab",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.order.status).toBe("acknowledged");
    expect(out.order.uhid).toBe(uhid);
    expect(out.order.idempotent).toBe(false);

    const persisted = db.getOrders().find((o) => o.id === orderId)!;
    expect(persisted.acknowledgedAt).toBe("2026-09-12T15:00:00.000Z");
    expect(persisted.ackSource).toBe("n8n-order-lab");
    expect(persisted.idempotencyKey).toBe(`IDEM-${orderId}`);
  });

  it("re-delivery with the SAME idempotencyKey is a no-op (idempotent consumer)", () => {
    const { orderId } = makeLabOrder();
    const ack = { orderId, idempotencyKey: `IDEM-${orderId}` } as const;
    const first = handleLabOrderAck(ack);
    const second = handleLabOrderAck(ack);
    expect(first.ok && !(first as { order: { idempotent: boolean } }).order.idempotent).toBe(true);
    expect(second.ok && (second as { order: { idempotent: boolean } }).order.idempotent).toBe(true);
  });

  it("conflicting ack for an already-acknowledged order → CONFLICTING_ACK", () => {
    const { orderId } = makeLabOrder();
    handleLabOrderAck({ orderId, idempotencyKey: `IDEM-A-${orderId}` });
    const conflict = handleLabOrderAck({ orderId, idempotencyKey: `IDEM-B-${orderId}` });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe("CONFLICTING_ACK");
  });

  it("unknown orderId → ORDER_NOT_FOUND (never guessed)", () => {
    const out = handleLabOrderAck({ orderId: "ORD-NOPE", idempotencyKey: "IDEM-X" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("ORDER_NOT_FOUND");
  });

  it("missing idempotencyKey → CONTRACT_VIOLATION (fail closed)", () => {
    const { orderId } = makeLabOrder();
    const out = handleLabOrderAck({ orderId } as never);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("CONTRACT_VIOLATION");
  });

  it("fireAutomation never fakes success when n8n is unconfigured", async () => {
    const saved = process.env.N8N_BASE_URL;
    delete process.env.N8N_BASE_URL;
    delete process.env.VITE_N8N_BASE;
    const result = await fireAutomation("order-lab", { probe: true });
    if (saved) process.env.N8N_BASE_URL = saved;
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("CONFIG_REQUIRED");
  });

  it("notifyOrderAck writes a Patient Timeline (audit) entry + SSE notification", () => {
    const { orderId } = makeLabOrder();
    const out = handleLabOrderAck({ orderId, idempotencyKey: `IDEM-${orderId}`, correlationId: `COR-${orderId}`, acknowledgedAt: "2026-09-12T15:00:00.000Z" });
    if (!out.ok) throw new Error("ack should succeed");
    const { auditId, eventId } = notifyOrderAck(out);

    // Timeline: append-only audit log entry for this order/patient
    const trail = db.getAuditTrail(500);
    const entry = trail.find((a) => a.id === auditId);
    expect(entry).toBeDefined();
    expect(entry?.action).toBe("LAB_ORDER_ACKNOWLEDGED");
    expect(entry?.patientId).toBe(out.order.patientId);
    expect(entry?.details).toContain(out.order.id);
    expect(entry?.status).toBe("SUCCESS");

    // Notification: SSE event emitted with role targeting
    expect(eventId).toMatch(/^EVT-/);
  });
});
