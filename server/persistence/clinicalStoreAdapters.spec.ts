import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { configureWorkflowPersistence, _resetWorkflowForTest, recordOrderEvent, listWorkflowEvents, listWorkflowOverrides, statusChipForRole } from "../../src/astra/clinical/workflow/workflowGuard";
import { ORDER_EVENTS } from "../../src/astra/clinical/workflow/orderEvents";
import { configureResultsPersistence, _resetResultsForTest, acknowledgeCriticalAlert, listCriticalAlerts, listReportVersions, listResultNotifications, markResultNotificationRead, reviseReport, submitReport } from "../../src/astra/clinical/results/resultsLoop";
import { beginTraceFor, configureTracePersistence, endTraceFor, recordSpan, reconstructTrace, resetTraceStore } from "../../src/astra/brain/part5/trace";
import { open } from "./durableJsonl";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "astra-clinical-"));
}

function snapshotAdapter<T>(name: string, dir: string, scrub?: (record: T) => T) {
  const stream = open(`${name}-${Math.random().toString(36).slice(2)}`, dir);
  return {
    append(kind: string, record: T): void {
      stream.append(kind, scrub ? scrub(record) : record);
    },
    load(): T | null {
      const entries = stream.replay();
      return (entries[entries.length - 1]?.payload as T | undefined) ?? null;
    },
  };
}

function scrubTrace<T>(record: T): T {
  if (typeof record === "string") return record.replace(/UHID\s*\d+|\b\d{6,}\b|sk-[A-Za-z0-9_-]+/g, "[redacted]") as T;
  if (Array.isArray(record)) return record.map(scrubTrace) as T;
  if (record && typeof record === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) out[key] = scrubTrace(value);
    return out as T;
  }
  return record;
}

beforeEach(() => {
  _resetWorkflowForTest();
  _resetResultsForTest();
  resetTraceStore();
});

describe("clinical store persistence hooks", () => {
  it("survives restart for workflow events and overrides", () => {
    const adapter = snapshotAdapter<any>("workflow", tempDir());
    configureWorkflowPersistence(adapter);
    recordOrderEvent({ event: ORDER_EVENTS.INVESTIGATION_ORDER_CREATED, patientUhid: "UHID-SYNTH-WF", orderId: "ORD-1", actorId: "doc", actorRole: "doctor" });
    recordOrderEvent({ event: ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED, patientUhid: "UHID-SYNTH-WF", orderId: "ORD-1", actorId: "cash", actorRole: "billing" });
    recordOrderEvent({ event: ORDER_EVENTS.REPORT_UPLOADED, patientUhid: "UHID-SYNTH-WF", orderId: "ORD-1", actorId: "lab", actorRole: "lab" });
    const beforeEvents = listWorkflowEvents("UHID-SYNTH-WF");
    const beforeChip = statusChipForRole("UHID-SYNTH-WF", "doctor", "ORD-1");
    _resetWorkflowForTest();
    configureWorkflowPersistence(adapter);
    expect(listWorkflowEvents("UHID-SYNTH-WF")).toEqual(beforeEvents);
    expect(listWorkflowOverrides("UHID-SYNTH-WF")).toEqual([]);
    expect(statusChipForRole("UHID-SYNTH-WF", "doctor", "ORD-1")).toBe(beforeChip);
  });

  it("survives restart for results reports, critical acknowledgements and notification reads", () => {
    const adapter = snapshotAdapter<any>("results", tempDir());
    configureResultsPersistence(adapter);
    const uploaded = submitReport({
      patientUhid: "UHID-SYNTH-RES",
      testName: "CBC",
      department: "laboratory",
      values: [{ param: "Hb", value: "4.9", unit: "g/dL" }],
      uploadedBy: "lab-1",
      uploadedByRole: "lab",
      at: "2026-09-29T08:00:00.000Z",
    });
    if (!uploaded.ok || !uploaded.alert) throw new Error("upload failed");
    const ack = acknowledgeCriticalAlert(uploaded.alert.id, { doctorId: "dr-synth", doctorName: "Dr Synth", at: "2026-09-29T08:05:00.000Z" });
    expect(ack.ok).toBe(true);
    const revised = reviseReport(uploaded.reportId, {
      patientUhid: "UHID-SYNTH-RES",
      testName: "CBC",
      department: "laboratory",
      values: [{ param: "Hb", value: "5.1", unit: "g/dL" }],
      uploadedBy: "lab-1",
      uploadedByRole: "lab",
      reason: "Synthetic correction",
      at: "2026-09-29T08:10:00.000Z",
    });
    expect(revised.ok).toBe(true);
    markResultNotificationRead(uploaded.notification.id, "2026-09-29T08:15:00.000Z");
    const beforeAlerts = listCriticalAlerts("all", "UHID-SYNTH-RES");
    _resetResultsForTest();
    configureResultsPersistence(adapter);
    expect(listCriticalAlerts("all", "UHID-SYNTH-RES")).toEqual(beforeAlerts);
    expect(listReportVersions("UHID-SYNTH-RES", undefined, "CBC")).toHaveLength(2);
    expect(listResultNotifications("UHID-SYNTH-RES")[0].read).toBe(true);
  });

  it("persists completed traces without patient identifiers or secrets", () => {
    const dir = tempDir();
    const adapter = snapshotAdapter<any>("flight", dir, scrubTrace);
    configureTracePersistence({
      append: adapter.append,
      load: (requestId) => adapter.load()?.request_id === requestId ? adapter.load() : null,
    });
    beginTraceFor("trace-synth");
    recordSpan({ correlationId: "trace-synth", kind: "tool", name: "synthetic", latencyMs: 1, detail: "UHID 123456 with sk-abc12345xyz" });
    endTraceFor("trace-synth");
    resetTraceStore();
    configureTracePersistence({
      append: adapter.append,
      load: (requestId) => adapter.load()?.request_id === requestId ? adapter.load() : null,
    });
    const reconstructed = reconstructTrace("trace-synth");
    expect(reconstructed.found).toBe(true);
    const raw = fs.readdirSync(dir).map((file) => fs.readFileSync(path.join(dir, file), "utf8")).join("\n");
    expect(JSON.stringify(reconstructed)).not.toContain("123456");
    expect(JSON.stringify(reconstructed)).not.toContain("sk-abc");
    expect(raw).not.toContain("sk-abc");
  });
});
