/**
 * R6-01 boot-level persistence checks through the REAL adapters
 * (configureClinicalStorePersistence with a temp root). SYNTHETIC fixtures only;
 * nothing is written to data/.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureClinicalStorePersistence } from "./clinicalStoreAdapters";
import { open } from "./durableJsonl";
import {
  _resetWardSafetyForTest,
  administerDoseTask,
  configureWardPersistence,
  createWardSbarDraft,
  holdDoseTask,
  listWardEscalations,
  listWardSbar,
  pollWardEscalations,
  marComplianceForDay,
  scheduleDosesForPatient,
  startWardVitalsSchedule,
  wardPatientState,
} from "../../src/astra/clinical/ward/wardSafety";
import {
  _resetResultsForTest,
  configureResultsPersistence,
  listCriticalAlerts,
  raiseVitalsCriticalAlert,
} from "../../src/astra/clinical/results/resultsLoop";
import { _resetWorkflowForTest, configureWorkflowPersistence, decideWorkflowAction, listWorkflowEvents, listWorkflowOverrides, recordOrderEvent, statusChipForRole } from "../../src/astra/clinical/workflow/workflowGuard";
import { ORDER_EVENTS } from "../../src/astra/clinical/workflow/orderEvents";
import { beginTraceFor, configureTracePersistence, endTraceFor, reconstructTrace, recordSpan, resetTraceStore } from "../../src/astra/brain/part5/trace";

const NURSE = { name: "SYNTHETIC Nurse A", role: "ward" };
const PATIENT = { patientUhid: "UHID-SYNTH-BOOT", patientName: "SYNTHETIC Patient", bedNumber: "S-1", wardName: "Synthetic Ward" };
const ORDER = { id: "ORD-SYNTH-1", drugName: "Inj. Synthetic", dose: "1 g", route: "IV", frequency: "TDS" };

function at(hours: number, minutes = 0, day = 29): number {
  return new Date(2026, 8, day, hours, minutes, 0, 0).getTime();
}

function resetAll(): void {
  _resetWardSafetyForTest();
  _resetResultsForTest();
  _resetWorkflowForTest();
  resetTraceStore();
}

let root = "";

beforeEach(() => {
  resetAll();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "astra-r601-boot-"));
});

afterEach(() => {
  resetAll();
  configureWardPersistence(null);
  configureResultsPersistence(null);
  configureWorkflowPersistence(null);
  configureTracePersistence(null);
  vi.restoreAllMocks();
});

describe("R6-01 ward restart survival (real adapters)", () => {
  it("dose statuses, before/after trail, vitals timer, escalation and SBAR survive a restart", () => {
    configureClinicalStorePersistence({ root, nowMs: at(7) });
    startWardVitalsSchedule(PATIENT, at(7));
    const schedule = scheduleDosesForPatient(PATIENT, [ORDER], at(7));
    if (!schedule.ok) throw new Error("schedule failed");
    const [first, second] = schedule.created;
    // 08:00 dose goes overdue -> Level 2, then given -> escalation resolved.
    pollWardEscalations(at(8, 20));
    expect(listWardEscalations(PATIENT.patientUhid).some((entry) => entry.taskId === first.id)).toBe(true);
    expect(administerDoseTask(first.id, NURSE, at(8, 25)).ok).toBe(true);
    expect(holdDoseTask(second.id, NURSE, "SYNTHETIC reason: BP low", at(13, 55)).ok).toBe(true);
    expect(createWardSbarDraft(PATIENT.patientUhid, { nowMs: at(14) }).ok).toBe(true);

    const before = JSON.parse(JSON.stringify(wardPatientState(PATIENT.patientUhid)));
    const escalationsBefore = listWardEscalations(PATIENT.patientUhid);
    const sbarBefore = listWardSbar(PATIENT.patientUhid);

    resetAll();
    expect(wardPatientState(PATIENT.patientUhid)).toBeUndefined();
    configureClinicalStorePersistence({ root, nowMs: at(14, 1) });

    const after = wardPatientState(PATIENT.patientUhid)!;
    expect(after.vitalsDueAtMs).toBe(before.vitalsDueAtMs);
    const given = after.doses.find((task) => task.id === first.id)!;
    const held = after.doses.find((task) => task.id === second.id)!;
    expect(given.status).toBe("GIVEN");
    expect(given.statusHistory).toEqual([{ before: "SCHEDULED", after: "GIVEN", actor: NURSE.name, role: "ward", at: new Date(at(8, 25)).toISOString() }]);
    expect(held.status).toBe("HELD");
    expect(held.statusHistory?.[0]).toMatchObject({ before: "SCHEDULED", after: "HELD", actor: NURSE.name, reason: "SYNTHETIC reason: BP low" });
    const resolved = listWardEscalations(PATIENT.patientUhid).find((entry) => entry.taskId === first.id)!;
    expect(resolved.resolvedBy).toBe(NURSE.name);
    expect(escalationsBefore.find((entry) => entry.taskId === first.id)?.resolvedAtMs).toBe(resolved.resolvedAtMs);
    expect(listWardSbar(PATIENT.patientUhid)).toEqual(sbarBefore);
  });

  it("a vitals timer that fell due while down fires exactly once with firedLate, and not again on a second boot", () => {
    configureClinicalStorePersistence({ root, nowMs: at(7) });
    startWardVitalsSchedule(PATIENT, at(7)); // due 09:00
    resetAll();
    configureClinicalStorePersistence({ root, nowMs: at(9, 10) }); // boot 10 min after it fell due
    const late = listWardEscalations(PATIENT.patientUhid).filter((entry) => entry.kind === "VITALS");
    expect(late).toHaveLength(1);
    expect(late[0].firedLate).toBe(true);
    resetAll();
    configureClinicalStorePersistence({ root, nowMs: at(9, 11) });
    expect(listWardEscalations(PATIENT.patientUhid).filter((entry) => entry.kind === "VITALS")).toHaveLength(1);
  });
});

describe("R6-01 results + telemetry through the real adapters", () => {
  it("an unacknowledged vitals Level-3 alert is not duplicated after a restart", () => {
    configureClinicalStorePersistence({ root });
    const finding = { ruleId: "sbp-low", analyte: "Systolic BP", value: 76, threshold: 90, unit: "mmHg", condition: "lessThan" as const, message: "SYNTHETIC SBP 76" };
    raiseVitalsCriticalAlert({ patientUhid: PATIENT.patientUhid, findings: [finding] });
    resetAll();
    configureClinicalStorePersistence({ root });
    raiseVitalsCriticalAlert({ patientUhid: PATIENT.patientUhid, findings: [finding] });
    expect(listCriticalAlerts("all", PATIENT.patientUhid)).toHaveLength(1);
  });

  it("flight traces on disk hold no identifiers or secrets and are found again after a restart", () => {
    configureClinicalStorePersistence({ root });
    beginTraceFor("synthetic-trace");
    recordSpan({ correlationId: "synthetic-trace", kind: "tool", name: "synthetic", latencyMs: 1, detail: "UHID 123456 with sk-abc12345xyz" });
    endTraceFor("synthetic-trace");
    resetTraceStore();
    configureClinicalStorePersistence({ root });
    expect(reconstructTrace("synthetic-trace").found).toBe(true);
    const flightDir = path.join(root, "telemetry", "flight");
    const raw = fs.readdirSync(flightDir).map((file) => fs.readFileSync(path.join(flightDir, file), "utf8")).join("\n");
    expect(raw).not.toContain("123456");
    expect(raw).not.toContain("sk-abc");
  });

  it("clinical state lives in checkpoints; the JSONL lines stay small change markers", () => {
    configureClinicalStorePersistence({ root, nowMs: at(7) });
    const schedule = scheduleDosesForPatient(PATIENT, [ORDER], at(7));
    if (!schedule.ok) throw new Error("schedule failed");
    const dir = path.join(root, "clinical", "ward-dose-tasks");
    const files = fs.readdirSync(dir);
    expect(files).toContain("ward-dose-tasks.checkpoint.json");
    const jsonl = files.filter((file) => file.endsWith(".jsonl")).map((file) => fs.readFileSync(path.join(dir, file), "utf8")).join("");
    expect(jsonl).not.toContain("Inj. Synthetic");
    expect(jsonl).toContain("stateHash");
  });

  it("an edited checkpoint still loads (never silently dropped) but warns the admin", () => {
    configureClinicalStorePersistence({ root, nowMs: at(7) });
    startWardVitalsSchedule(PATIENT, at(7));
    const file = path.join(root, "clinical", "ward-dose-tasks", "ward-dose-tasks.checkpoint.json");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("Synthetic Ward", "Synthetic Ward EDITED"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    resetAll();
    configureClinicalStorePersistence({ root, nowMs: at(7, 5) });
    expect(wardPatientState(PATIENT.patientUhid)?.wardName).toBe("Synthetic Ward EDITED");
    expect(warn.mock.calls.some((call) => String(call[0]).includes("does not match the last hash-chain entry"))).toBe(true);
  });
});

describe("R6-01 quarantine is one-time", () => {
  it("a quarantined segment is not replayed or re-quarantined on the next boot", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-r601-q-"));
    const name = `q${Math.random().toString(36).slice(2, 8)}`;
    const stream = open(name, dir);
    for (let i = 0; i < 5; i += 1) stream.append("synthetic", { i });
    const segment = fs.readdirSync(dir).find((file) => file.endsWith(".jsonl"))!;
    const full = path.join(dir, segment);
    const lines = fs.readFileSync(full, "utf8").trim().split(/\r?\n/);
    lines[2] = lines[2].replace('"i":2', '"i":9');
    fs.writeFileSync(full, `${lines.join("\n")}\n`);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(stream.replay()).toHaveLength(2);
    expect(stream.replay()).toHaveLength(2);
    expect(stream.verify().ok).toBe(true);
    expect(fs.readdirSync(dir).filter((file) => file.includes("quarantined"))).toHaveLength(1);
  });
});

describe("R6-01 chain resumes after a quarantine", () => {
  it("appends after a runtime quarantine chain onto the good prefix", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-r601-r-"));
    const name = `r${Math.random().toString(36).slice(2, 8)}`;
    const stream = open(name, dir);
    for (let i = 0; i < 4; i += 1) stream.append("synthetic", { i });
    const full = path.join(dir, fs.readdirSync(dir).find((file) => file.endsWith(".jsonl"))!);
    const lines = fs.readFileSync(full, "utf8").trim().split(/\r?\n/);
    lines[3] = lines[3].replace('"i":3', '"i":7');
    fs.writeFileSync(full, `${lines.join("\n")}\n`);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(stream.replay()).toHaveLength(3);
    stream.append("synthetic", { i: 99 });
    expect(stream.verify()).toMatchObject({ ok: true, entries: 4 });
  });
});

describe("R6-01 admission slots and workflow overrides survive restart", () => {
  it("not-due statuses survive a restart and day-1 MAR compliance stays 0 of 1", () => {
    configureClinicalStorePersistence({ root, nowMs: at(14, 30) });
    const profile = { ...PATIENT, patientUhid: "UHID-SYNTH-LATE", admittedAt: new Date(2026, 8, 29, 14, 30).toISOString() };
    const outcome = scheduleDosesForPatient(profile, [{ ...ORDER, frequency: "TDS" }], at(14, 30));
    if (!outcome.ok) throw new Error("schedule failed");
    expect(outcome.created.map((task) => task.status)).toEqual(["not_due_admitted_later", "not_due_admitted_later", "SCHEDULED"]);
    expect(marComplianceForDay(profile.patientUhid, at(21))).toEqual({ given: 0, due: 1 });
    resetAll();
    configureClinicalStorePersistence({ root, nowMs: at(21) });
    const doses = wardPatientState(profile.patientUhid)!.doses;
    expect(doses.map((task) => task.status)).toEqual(["not_due_admitted_later", "not_due_admitted_later", "SCHEDULED"]);
    expect(marComplianceForDay(profile.patientUhid, at(21))).toEqual({ given: 0, due: 1 });
    const overdue = listWardEscalations(profile.patientUhid).filter((entry) => entry.kind === "DOSE");
    expect(overdue.map((entry) => entry.taskId)).toEqual([doses[2].id]);
    expect(doses.slice(0, 2).every((task) => !overdue.some((entry) => entry.taskId === task.id))).toBe(true);
  });

  it("workflow events plus admin-PIN and emergency overrides survive a restart with before/after", () => {
    configureClinicalStorePersistence({ root });
    recordOrderEvent({ event: ORDER_EVENTS.INVESTIGATION_ORDER_CREATED, patientUhid: "UHID-SYNTH-WF", orderId: "ORD-1", actorId: "doc", actorRole: "doctor", at: "2026-09-29T08:00:00.000Z" });
    recordOrderEvent({ event: ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED, patientUhid: "UHID-SYNTH-WF", orderId: "ORD-1", actorId: "cash", actorRole: "billing", at: "2026-09-29T08:05:00.000Z" });
    recordOrderEvent({ event: ORDER_EVENTS.REPORT_UPLOADED, patientUhid: "UHID-SYNTH-WF", orderId: "ORD-2", actorId: "lab", actorRole: "lab", at: "2026-09-29T08:10:00.000Z" });
    const pin = decideWorkflowAction({
      action: "start_investigation",
      actor: { id: "lab-1", role: "lab", device: "bench" },
      patientUhid: "UHID-SYNTH-WF",
      orderId: "ORD-3",
      department: "laboratory",
      paid: false,
      prescriptionConfirmed: false,
      doctorAdmissionOrder: false,
      emergency: false,
      now: "2026-09-29T08:20:00.000Z",
      adminPin: { pin: "2468", expectedPin: "2468", reason: "SYNTHETIC pin reason" },
    });
    const emergency = decideWorkflowAction({
      action: "upload_report",
      actor: { id: "rad-1", role: "radiology", device: "usg" },
      patientUhid: "UHID-SYNTH-WF",
      orderId: "ORD-4",
      department: "radiology",
      paid: false,
      prescriptionConfirmed: false,
      doctorAdmissionOrder: false,
      emergency: true,
      emergencyReason: "SYNTHETIC emergency",
      now: "2026-09-29T08:30:00.000Z",
    });
    expect(pin.allowed).toBe(true);
    expect(emergency.allowed).toBe(true);
    const eventsBefore = listWorkflowEvents("UHID-SYNTH-WF");
    const overridesBefore = listWorkflowOverrides("UHID-SYNTH-WF");
    const chipBefore = statusChipForRole("UHID-SYNTH-WF", "doctor", "ORD-1");
    expect(eventsBefore).toHaveLength(3);
    expect(overridesBefore.map((entry) => entry.kind).sort()).toEqual(["admin_pin", "emergency"]);
    expect(overridesBefore.find((entry) => entry.kind === "admin_pin")).toMatchObject({ before: "PAYMENT_REQUIRED", after: "ADMIN_PIN_OVERRIDE", actorId: "lab-1", actorRole: "lab" });
    expect(overridesBefore.find((entry) => entry.kind === "emergency")).toMatchObject({ before: "PAYMENT_REQUIRED", after: "EMERGENCY_OVERRIDE", actorId: "rad-1", actorRole: "radiology" });
    resetAll();
    configureClinicalStorePersistence({ root });
    expect(listWorkflowEvents("UHID-SYNTH-WF")).toEqual(eventsBefore);
    expect(listWorkflowOverrides("UHID-SYNTH-WF")).toEqual(overridesBefore);
    expect(statusChipForRole("UHID-SYNTH-WF", "doctor", "ORD-1")).toBe(chipBefore);
  });
});
