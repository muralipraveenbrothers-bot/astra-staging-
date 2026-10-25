/**
 * R5-06 route contract: report upload locks the version and notifies the
 * ordering doctor; critical values raise a Level-3 alert that only a doctor
 * Acknowledge can close (id + time logged); unacknowledged alerts escalate;
 * PDF-only reports are flagged for manual review.
 * db + realtimeHub are mocked so the spec never writes to data/ and captures
 * the SSE broadcasts instead.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const servers: Server[] = [];
let resetResultsClock: (() => void) | undefined;
afterEach(() => {
  resetResultsClock?.();
  resetResultsClock = undefined;
});
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function boot() {
  vi.resetModules();
  const broadcast = vi.fn();
  const logAudit = vi.fn();
  vi.doMock("../events", () => ({ realtimeHub: { broadcast } }));
  vi.doMock("../db", () => ({
    db: {
      logAudit,
      getPatientById: () => undefined,
      getOrders: () => [{ id: "ORD-CBC-1", orderedBy: "Dr. Murali Praveen, M.D." }],
    },
  }));
  const { registerResultsRoutes } = await import("./results");
  const { createSession } = await import("../rbac");
  const results = await import("../../src/astra/clinical/results/resultsLoop.js");
  resetResultsClock = () => results._setClockForTest();
  const workflow = await import("../../src/astra/clinical/workflow/workflowGuard.js");
  results._resetResultsForTest();
  workflow._resetWorkflowForTest();
  const app = express();
  app.use(express.json());
  registerResultsRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    broadcast,
    logAudit,
    results,
    workflow,
    doctor: createSession("doctor", "Dr. Test Doctor").sessionToken,
    lab: createSession("lab", "Lab Tech Test").sessionToken,
  };
}

type Boot = Awaited<ReturnType<typeof boot>>;

async function post(boot: Boot, path: string, body: unknown, token?: string) {
  return fetch(`${boot.base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function get(boot: Boot, path: string, token?: string) {
  return fetch(`${boot.base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

const CBC = {
  patientUhid: "UHID-SURYA",
  patientName: "Surya",
  orderId: "ORD-CBC-1",
  testName: "Complete Blood Picture (CBP)",
  department: "laboratory",
};

describe("R5-06 results routes: sessions", () => {
  it("refuses every route without a session", async () => {
    const boot = await bootFresh();
    const upload = await post(boot, "/api/clinical/results/report", CBC);
    expect(upload.status).toBe(401);
    const alerts = await get(boot, "/api/clinical/results/alerts");
    expect(alerts.status).toBe(401);
  });
});

describe("R5-06 report upload -> notify + lock", () => {
  it("uploads a CBC for Surya: version locked, doctor notified, canonical event recorded once", async () => {
    const b = await bootFresh();
    const res = await post(b, "/api/clinical/results/report", { ...CBC, values: [{ param: "Hb", value: "10", unit: "g/dL" }] }, b.lab);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBe(1);
    expect(body.report.locked).toBe(true);
    expect(body.notification.title).toBe("New investigation results received");
    expect(body.notification.read).toBe(false);
    expect(body.notification.detail).toContain("Dr. Murali Praveen");
    expect(body.trends).toEqual([{ param: "Hb", direction: "new", current: 10 }]);

    const notify = b.broadcast.mock.calls.find(([event]) => event.type === "LAB_RESULT_VERIFIED");
    expect(notify?.[0].targetRoles).toEqual(["doctor", "admin"]);
    expect(notify?.[0].payload.notification.id).toBe(body.notification.id);

    const events = b.workflow.listWorkflowEvents("UHID-SURYA", "ORD-CBC-1");
    expect(events.filter((e) => e.event === "REPORT_UPLOADED")).toHaveLength(1);

    // A locked report cannot be overwritten.
    const again = await post(b, "/api/clinical/results/report", { ...CBC, values: [{ param: "Hb", value: "9" }] }, b.lab);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toContain("REPORT_LOCKED");
    // The failed overwrite did not duplicate the canonical event.
    expect(b.workflow.listWorkflowEvents("UHID-SURYA", "ORD-CBC-1").filter((e) => e.event === "REPORT_UPLOADED")).toHaveLength(1);
  });

  it("revises only with a reason, creating locked version 2 with a trend arrow", async () => {
    const b = await bootFresh();
    const first = await (await post(b, "/api/clinical/results/report", { ...CBC, values: [{ param: "Hb", value: "10", unit: "g/dL" }] }, b.lab)).json() as { reportId: string };

    const noReason = await post(b, `/api/clinical/results/report/${first.reportId}/revise`, { ...CBC, values: [{ param: "Hb", value: "8" }], reason: "" }, b.lab);
    expect(noReason.status).toBe(400);

    const revised = await post(b, `/api/clinical/results/report/${first.reportId}/revise`, { ...CBC, values: [{ param: "Hb", value: "8", unit: "g/dL" }], reason: "Analyzer re-run after QC flag" }, b.lab);
    expect(revised.status).toBe(200);
    const body = await revised.json();
    expect(body.version).toBe(2);
    expect(body.report.revisionReason).toBe("Analyzer re-run after QC flag");
    expect(body.trends).toEqual([{ param: "Hb", direction: "down", previous: 10, current: 8 }]);
  });
});

describe("R5-06 critical value alerts over the API", () => {
  it("K+ 6.2 raises a Level-3 alert; only a doctor Acknowledge closes it, logging id + time", async () => {
    const b = await bootFresh();
    const res = await post(b, "/api/clinical/results/report", { ...CBC, values: [{ param: "Serum Potassium (K+)", value: "6.2", unit: "mmol/L" }] }, b.lab);
    const body = await res.json();
    expect(body.alert.level).toBe(3);
    const alertId = body.alert.id as string;
    const criticalBroadcast = b.broadcast.mock.calls.find(([event]) => event.type === "CRITICAL_ALERT");
    expect(criticalBroadcast?.[0].targetRoles).toEqual(["doctor", "admin"]);
    expect(b.logAudit.mock.calls.some(([entry]) => entry.action === "CRITICAL_VALUE_RAISED")).toBe(true);

    // The lab that uploaded cannot close it.
    const labAck = await post(b, `/api/clinical/results/alerts/${alertId}/acknowledge`, {}, b.lab);
    expect(labAck.status).toBe(403);
    let open = await (await get(b, "/api/clinical/results/alerts?status=open", b.doctor)).json();
    expect(open.alerts).toHaveLength(1);

    const ack = await post(b, `/api/clinical/results/alerts/${alertId}/acknowledge`, {}, b.doctor);
    expect(ack.status).toBe(200);
    const ackBody = await ack.json();
    expect(ackBody.alert.acknowledged.doctorId).toBeTruthy();
    expect(ackBody.alert.acknowledged.doctorName).toBe("Dr. Test Doctor");
    expect(ackBody.alert.acknowledged.at).toBeTruthy();
    expect(b.logAudit.mock.calls.some(([entry]) => entry.action === "CRITICAL_VALUE_ACKNOWLEDGED" && entry.details.includes("Dr. Test Doctor"))).toBe(true);

    open = await (await get(b, "/api/clinical/results/alerts?status=open", b.doctor)).json();
    expect(open.alerts).toHaveLength(0);

    const twice = await post(b, `/api/clinical/results/alerts/${alertId}/acknowledge`, {}, b.doctor);
    expect(twice.status).toBe(409);
    expect(((await twice.json()) as { error: string }).error).toBe("ALREADY_ACKNOWLEDGED");
  });

  it("K+ 5.0 / Hb 10 raise no alert", async () => {
    const b = await bootFresh();
    const res = await post(b, "/api/clinical/results/report", { ...CBC, values: [{ param: "Potassium", value: "5.0", unit: "mmol/L" }, { param: "Hb", value: "10", unit: "g/dL" }] }, b.lab);
    const body = await res.json();
    expect(body.alert).toBeUndefined();
    expect(body.criticalCheck.findings).toEqual([]);
    expect(b.broadcast.mock.calls.some(([event]) => event.type === "CRITICAL_ALERT")).toBe(false);
  });

  it("escalates an unacknowledged alert after the configured timeout", async () => {
    const b = await bootFresh();
    let nowMs = Date.now();
    b.results._setClockForTest(() => nowMs);
    b.results._setCriticalAlertConfigForTest({ escalationTimeoutMs: 30, escalationRepeatMs: 20 });
    await post(b, "/api/clinical/results/report", { ...CBC, values: [{ param: "Hb", value: "6.5", unit: "g/dL" }] }, b.lab);
    const before = await (await get(b, "/api/clinical/results/alerts?status=open", b.doctor)).json();
    expect(before.alerts[0].escalated).toBe(false);
    nowMs += 80;
    const after = await (await get(b, "/api/clinical/results/alerts?status=open", b.doctor)).json();
    expect(after.alerts[0].escalated).toBe(true);
    expect(after.alerts[0].escalationRepeats).toBeGreaterThanOrEqual(1);
  });

  it("PDF-only reports flag manual review, and still notify the doctor", async () => {
    const b = await bootFresh();
    const res = await post(b, "/api/clinical/results/report", {
      patientUhid: "UHID-SURYA",
      patientName: "Surya",
      testName: "X-Ray Chest PA",
      department: "radiology",
      pdfOnly: true,
    }, b.lab);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.criticalCheck.possible).toBe(false);
    expect(body.criticalCheck.manualReviewRequired).toBe(true);
    expect(body.criticalCheck.note).toBe("critical check not possible - manual review");
    expect(body.alert).toBeUndefined();
    expect(body.notification.title).toBe("New investigation results received");
  });

  it("marks result notifications read (unread badge source)", async () => {
    const b = await bootFresh();
    const submitted = await (await post(b, "/api/clinical/results/report", { ...CBC, values: [{ param: "Hb", value: "10" }] }, b.lab)).json();
    let list = await (await get(b, "/api/clinical/results/notifications?unread=1", b.doctor)).json();
    expect(list.notifications).toHaveLength(1);
    const read = await post(b, `/api/clinical/results/notifications/${submitted.notification.id}/read`, {}, b.doctor);
    expect(read.status).toBe(200);
    list = await (await get(b, "/api/clinical/results/notifications?unread=1", b.doctor)).json();
    expect(list.notifications).toHaveLength(0);
    // Lab cannot read the doctor's notifications.
    const labList = await get(b, "/api/clinical/results/notifications", b.lab);
    expect(labList.status).toBe(403);
  });
});

async function bootFresh() {
  return boot();
}
