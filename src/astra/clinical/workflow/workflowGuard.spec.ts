import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { ORDER_EVENTS, ORDER_EVENT_ALIASES, PENDING_EMERGENCY_BILL_LABEL, WORKFLOW_STATUS_ROLES, orderStatusesForEvent, resolveOrderEvent } from "./orderEvents";
import {
  _resetWorkflowForTest,
  billLabelFor,
  decideWorkflowAction,
  delayStampFor,
  emergencyFlagFromPatient,
  listWorkflowOverrides,
  recordOrderEvent,
  statusChipForRole,
  type GuardInput,
} from "./workflowGuard";

const here = dirname(fileURLToPath(import.meta.url));
const PIN = "2468";
const actor = { id: "lab-1", role: "lab", device: "lab-bench-1" };

function base(overrides: Partial<GuardInput> = {}): GuardInput {
  return {
    action: "start_investigation",
    actor,
    patientUhid: "UHID-R505",
    orderId: "ORD-USG-1",
    department: "laboratory",
    paid: false,
    prescriptionConfirmed: false,
    doctorAdmissionOrder: false,
    emergency: false,
    billed: false,
    now: "2026-09-28T05:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  _resetWorkflowForTest();
});

describe("R5-05 canonical order events", () => {
  it("resolves nb2 aliases onto the canonical names", () => {
    expect(resolveOrderEvent("REGISTRATION_COMPLETED")).toBe(ORDER_EVENTS.PATIENT_REGISTERED);
    expect(resolveOrderEvent("INVESTIGATION_ORDERED")).toBe(ORDER_EVENTS.INVESTIGATION_ORDER_CREATED);
    expect(resolveOrderEvent("INVESTIGATION_PAID")).toBe(ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED);
    expect(resolveOrderEvent("MEDICATION_DRAFTED")).toBe(ORDER_EVENTS.MEDICATION_DRAFT_CONFIRMED);
    expect(resolveOrderEvent("BILL_ACCEPTED")).toBe(ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED);
    expect(resolveOrderEvent("PAYMENT_CONFIRMED", { department: "pharmacy" })).toBe(ORDER_EVENTS.DRUG_BILL_PAID);
    expect(resolveOrderEvent("BILL_GENERATED", { department: "consultation" })).toBe(ORDER_EVENTS.CONSULTATION_BILL_PAID);
    expect(resolveOrderEvent("BILL_GENERATED")).toBe(ORDER_EVENT_ALIASES.BILL_GENERATED);
    expect(resolveOrderEvent("NOT_AN_EVENT")).toBeNull();
  });

  it("keeps every canonical event name in the one file", () => {
    const canonical = readFileSync(join(here, "orderEvents.ts"), "utf8");
    const guard = readFileSync(join(here, "workflowGuard.ts"), "utf8");
    const draft = readFileSync(join(here, "../medication/medicationDraft.ts"), "utf8");
    for (const name of Object.values(ORDER_EVENTS)) {
      expect(canonical).toContain(`"${name}"`);
      expect(guard).not.toContain(`"${name}"`);
      expect(draft).not.toContain(`"${name}"`);
    }
    for (const alias of Object.keys(ORDER_EVENT_ALIASES)) {
      expect(canonical).toContain(alias);
    }
  });

  it("maps each event onto an existing order status", () => {
    for (const name of Object.values(ORDER_EVENTS)) {
      const mapped = orderStatusesForEvent(name);
      expect(mapped.universal).toBeTruthy();
      expect(mapped.hospital).toBeTruthy();
      expect(mapped.work).toBeTruthy();
    }
    expect(orderStatusesForEvent(ORDER_EVENTS.REPORT_UPLOADED).hospital).toBe("completed");
    expect(orderStatusesForEvent(ORDER_EVENTS.MEDICATION_DISPENSED).hospital).toBe("dispensed");
    expect(orderStatusesForEvent(ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED).universal).toBe("IN_PROGRESS");
  });

  it("stores order, payment and execution timestamps", () => {
    const ordered = recordOrderEvent({
      event: "INVESTIGATION_ORDERED",
      department: "radiology",
      patientUhid: "UHID-R505",
      orderId: "ORD-USG-1",
      actorId: "dr-murali",
      actorRole: "doctor",
      device: "doctor-desk",
      at: "2026-09-28T05:00:00.000Z",
    });
    const paid = recordOrderEvent({
      event: "BILL_ACCEPTED",
      department: "radiology",
      patientUhid: "UHID-R505",
      orderId: "ORD-USG-1",
      actorId: "billing-1",
      actorRole: "billing",
      device: "billing-desk",
      at: "2026-09-28T06:30:00.000Z",
    });
    expect(ordered.ok).toBe(true);
    expect(paid.ok).toBe(true);
    if (ordered.ok) {
      expect(ordered.event.event).toBe(ORDER_EVENTS.INVESTIGATION_ORDER_CREATED);
      expect(ordered.event.aliasUsed).toBe("INVESTIGATION_ORDERED");
      expect(ordered.event.patientUhid).toBe("UHID-R505");
      expect(ordered.event.actorRole).toBe("doctor");
      expect(ordered.event.device).toBe("doctor-desk");
    }
    const stamp = delayStampFor("ORD-USG-1");
    expect(stamp?.orderedAt).toBe("2026-09-28T05:00:00.000Z");
    expect(stamp?.paymentAcceptedAt).toBe("2026-09-28T06:30:00.000Z");
    expect((Date.parse(stamp!.paymentAcceptedAt!) - Date.parse(stamp!.orderedAt!)) / 60000).toBe(90);
  });
});

describe("R5-05 workflow hard-stops", () => {
  it("rejects an unpaid lab start and upload, then allows payment or an admin PIN", () => {
    const started = decideWorkflowAction(base());
    expect(started.allowed).toBe(false);
    expect(started.code).toBe("PAYMENT_REQUIRED");

    const uploaded = decideWorkflowAction(base({ action: "upload_report" }));
    expect(uploaded.allowed).toBe(false);

    const paid = decideWorkflowAction(base({ paid: true }));
    expect(paid.allowed).toBe(true);
    expect(paid.code).toBe("PAYMENT_CONFIRMED");

    _resetWorkflowForTest();
    const pinned = decideWorkflowAction(base({
      adminPin: { pin: PIN, expectedPin: PIN, reason: "Consultant asked the study to start before the counter reopened." },
    }));
    expect(pinned.allowed).toBe(true);
    expect(pinned.code).toBe("ADMIN_PIN_OVERRIDE");
    const log = listWorkflowOverrides("UHID-R505");
    expect(log).toHaveLength(1);
    expect(log[0].kind).toBe("admin_pin");
    expect(log[0].actorId).toBe("lab-1");
    expect(log[0].reason).toContain("Consultant");
    expect(log[0].at).toBe("2026-09-28T05:00:00.000Z");

    const again = decideWorkflowAction(base({ action: "upload_report", now: "2026-09-28T05:10:00.000Z" }));
    expect(again.allowed).toBe(true);
  });

  it("rejects a missing PIN reason and a wrong PIN", () => {
    expect(decideWorkflowAction(base({ adminPin: { pin: PIN, expectedPin: PIN, reason: "  " } })).allowed).toBe(false);
    expect(decideWorkflowAction(base({ adminPin: { pin: "0000", expectedPin: PIN, reason: "Wrong pin" } })).allowed).toBe(false);
  });

  it("rejects dispense without a confirmed prescription, then allows an approved paid prescription", () => {
    const blocked = decideWorkflowAction(base({
      action: "dispense",
      actor: { id: "pharm-1", role: "pharmacy", device: "pharmacy-counter" },
      department: "pharmacy",
      orderId: "ORD-RX-1",
    }));
    expect(blocked.allowed).toBe(false);
    expect(blocked.code).toBe("PRESCRIPTION_NOT_CONFIRMED");

    recordOrderEvent({
      event: ORDER_EVENTS.MEDICATION_DRAFT_CONFIRMED,
      patientUhid: "UHID-R505",
      orderId: "ORD-RX-1",
      actorId: "dr-murali",
      actorRole: "doctor",
      device: "doctor-desk",
      at: "2026-09-28T04:00:00.000Z",
    });
    const unpaid = decideWorkflowAction(base({
      action: "dispense",
      actor: { id: "pharm-1", role: "pharmacy", device: "pharmacy-counter" },
      department: "pharmacy",
      orderId: "ORD-RX-1",
      prescriptionConfirmed: true,
    }));
    expect(unpaid.allowed).toBe(false);
    expect(unpaid.code).toBe("PAYMENT_REQUIRED");

    const allowed = decideWorkflowAction(base({
      action: "dispense",
      actor: { id: "pharm-1", role: "pharmacy", device: "pharmacy-counter" },
      department: "pharmacy",
      orderId: "ORD-RX-1",
      prescriptionConfirmed: true,
      paid: true,
    }));
    expect(allowed.allowed).toBe(true);
  });

  it("rejects admission without a doctor order", () => {
    const blocked = decideWorkflowAction(base({
      action: "admit",
      actor: { id: "ward-1", role: "ward", device: "ward-desk" },
      department: "ward",
      emergency: true,
    }));
    expect(blocked.allowed).toBe(false);
    expect(blocked.code).toBe("ADMISSION_WITHOUT_DOCTOR_ORDER");

    const allowed = decideWorkflowAction(base({
      action: "admit",
      actor: { id: "ward-1", role: "ward", device: "ward-desk" },
      doctorAdmissionOrder: true,
    }));
    expect(allowed.allowed).toBe(true);
  });

  it("lets an emergency patient through without payment and logs the override", () => {
    recordOrderEvent({
      event: ORDER_EVENTS.INVESTIGATION_ORDER_CREATED,
      patientUhid: "UHID-R505",
      orderId: "ORD-USG-1",
      actorId: "dr-murali",
      actorRole: "doctor",
      device: "casualty",
      at: "2026-09-28T04:50:00.000Z",
    });
    const decision = decideWorkflowAction(base({
      emergency: true,
      emergencyReason: "Casualty flag",
    }));
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("EMERGENCY_OVERRIDE");
    expect(decision.billLabel).toBe(PENDING_EMERGENCY_BILL_LABEL);
    expect(billLabelFor("UHID-R505")).toBe(PENDING_EMERGENCY_BILL_LABEL);
    const log = listWorkflowOverrides("UHID-R505");
    expect(log[0].kind).toBe("emergency");
    expect(log[0].actorId).toBe("lab-1");
    expect(log[0].actorRole).toBe("lab");
    expect(log[0].reason).toBe("Casualty flag");
    expect(statusChipForRole("UHID-R505", "lab", "ORD-USG-1")).toBe("Tests in progress");
  });

  it("does not let a lab technician add an unbilled test, including in an emergency", () => {
    const blocked = decideWorkflowAction(base({ action: "add_lab_test", emergency: true }));
    expect(blocked.allowed).toBe(false);
    expect(blocked.code).toBe("LAB_TECH_UNBILLED_TEST");
    const doctor = decideWorkflowAction(base({
      action: "add_lab_test",
      actor: { id: "dr-murali", role: "doctor", device: "doctor-desk" },
    }));
    expect(doctor.allowed).toBe(true);
  });

  it("never blocks viewing or reasoning when the bill is unpaid", () => {
    for (const action of ["view_patient", "reason_about_patient"] as const) {
      const decision = decideWorkflowAction(base({ action, emergency: false, paid: false }));
      expect(decision.allowed).toBe(true);
      expect(decision.code).toBe("CLINICAL_VIEW_OPEN");
    }
  });

  it("uses the casualty flag and the R5-02 emergency pathway", () => {
    expect(emergencyFlagFromPatient({ admissionStatus: "emergency" })).toMatchObject({ emergency: true, reason: "Casualty flag" });
    expect(emergencyFlagFromPatient({ casualty: true }).emergency).toBe(true);
    expect(emergencyFlagFromPatient({ vitals: { bp: "70/40" } }).emergency).toBe(true);
    expect(emergencyFlagFromPatient({ admissionStatus: "outpatient", vitals: { bp: "120/80" } }).emergency).toBe(false);
  });

  it("shows the same status chip to every department role", () => {
    recordOrderEvent({
      event: ORDER_EVENTS.INVESTIGATION_ORDER_CREATED,
      patientUhid: "UHID-R505",
      orderId: "ORD-USG-1",
      actorId: "dr-murali",
      actorRole: "doctor",
      device: "doctor-desk",
      at: "2026-09-28T05:00:00.000Z",
    });
    const chips = WORKFLOW_STATUS_ROLES.map((role) => statusChipForRole("UHID-R505", role, "ORD-USG-1"));
    expect(new Set(chips).size).toBe(1);
    expect(chips[0]).toBe("Tests pending payment");
    expect(chips).toEqual([
      statusChipForRole("UHID-R505", "reception", "ORD-USG-1"),
      statusChipForRole("UHID-R505", "billing", "ORD-USG-1"),
      statusChipForRole("UHID-R505", "lab", "ORD-USG-1"),
      statusChipForRole("UHID-R505", "doctor", "ORD-USG-1"),
      statusChipForRole("UHID-R505", "radiology", "ORD-USG-1"),
      statusChipForRole("UHID-R505", "pharmacy", "ORD-USG-1"),
      statusChipForRole("UHID-R505", "ward", "ORD-USG-1"),
      statusChipForRole("UHID-R505", "ot", "ORD-USG-1"),
    ]);
  });
});
