/**
 * R5-05 hard-stops. Payment never blocks a doctor from viewing or reasoning.
 * Emergency (R5-02 pathway or a casualty flag) lets clinical execution proceed
 * and marks the bill pending – emergency. An admin PIN plus a reason can
 * override a hard-stop. Both overrides are logged.
 */
import { evaluateRiskRadar, type ClinicalIngressPatient } from "../clinicalIngress";
import {
  ORDER_EVENT_CHIPS,
  ORDER_EVENTS,
  PENDING_EMERGENCY_BILL_LABEL,
  eventMarksExecution,
  eventMarksOrdered,
  eventMarksPayment,
  resolveOrderEvent,
  type CanonicalOrderEvent,
  type WorkflowDepartment,
} from "./orderEvents";

export type WorkflowAction =
  | "start_investigation"
  | "upload_report"
  | "dispense"
  | "admit"
  | "add_lab_test"
  | "view_patient"
  | "reason_about_patient";

export interface WorkflowActor {
  id: string;
  role: string;
  device?: string;
}

export interface OrderWorkflowEvent {
  id: string;
  event: CanonicalOrderEvent;
  aliasUsed?: string;
  patientUhid: string;
  orderId: string;
  actorId: string;
  actorRole: string;
  device: string;
  at: string;
}

export interface WorkflowOverrideRecord {
  id: string;
  kind: "admin_pin" | "emergency";
  patientUhid: string;
  orderId: string;
  actorId: string;
  actorRole: string;
  device: string;
  reason: string;
  at: string;
  action: WorkflowAction;
  /** Status this override moved the action from, and the status it moved it to. */
  before?: string;
  after?: string;
}

export interface OrderDelayStamp {
  orderId: string;
  patientUhid: string;
  orderedAt?: string;
  paymentAcceptedAt?: string;
  executedAt?: string;
}

export interface GuardDecision {
  allowed: boolean;
  code: string;
  message: string;
  billLabel?: string;
  chip: string;
  override?: WorkflowOverrideRecord;
}

export interface GuardInput {
  action: WorkflowAction;
  actor: WorkflowActor;
  patientUhid: string;
  orderId?: string;
  department?: WorkflowDepartment;
  paid: boolean;
  prescriptionConfirmed: boolean;
  doctorAdmissionOrder: boolean;
  emergency: boolean;
  emergencyReason?: string;
  billed?: boolean;
  existingPaymentOverride?: boolean;
  adminPin?: { pin: string; expectedPin: string; reason: string };
  now?: string;
}

let hardStopsEnabled = true;
let seq = 0;
const events: OrderWorkflowEvent[] = [];
const overrides: WorkflowOverrideRecord[] = [];
const stamps = new Map<string, OrderDelayStamp>();
const billLabels = new Map<string, string>();
const listeners = new Set<() => void>();

export interface WorkflowPersistenceState {
  events: OrderWorkflowEvent[];
  overrides: WorkflowOverrideRecord[];
  stamps: OrderDelayStamp[];
  billLabels: Array<[string, string]>;
}

export interface WorkflowPersistence {
  append(kind: string, record: WorkflowPersistenceState): void;
  load(): WorkflowPersistenceState | null;
}

let persistence: WorkflowPersistence | null = null;
let hydrating = false;

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeWorkflow(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function workflowHardStopsEnabled(): boolean {
  return hardStopsEnabled;
}

export function _setWorkflowHardStopsForTest(enabled: boolean): void {
  hardStopsEnabled = enabled;
}

export function _resetWorkflowForTest(): void {
  events.length = 0;
  overrides.length = 0;
  stamps.clear();
  billLabels.clear();
  hardStopsEnabled = true;
  seq = 0;
  persistence = null;
}

function snapshot(): WorkflowPersistenceState {
  return {
    events: events.map((entry) => ({ ...entry })),
    overrides: overrides.map((entry) => ({ ...entry })),
    stamps: [...stamps.values()].map((entry) => ({ ...entry })),
    billLabels: [...billLabels.entries()],
  };
}

function persist(kind: string): void {
  if (!hydrating) persistence?.append(kind, snapshot());
}

export function configureWorkflowPersistence(p: WorkflowPersistence | null): void {
  persistence = p;
  if (!p) return;
  const loaded = p.load();
  if (!loaded) return;
  hydrating = true;
  events.length = 0;
  overrides.length = 0;
  stamps.clear();
  billLabels.clear();
  events.push(...loaded.events.map((entry) => ({ ...entry })));
  overrides.push(...loaded.overrides.map((entry) => ({ ...entry })));
  for (const stamp of loaded.stamps) stamps.set(stamp.orderId, { ...stamp });
  for (const [key, label] of loaded.billLabels) billLabels.set(key, label);
  hydrating = false;
  emit();
}

export function adminPinMatches(pin: string, expectedPin: string): boolean {
  if (!pin || !expectedPin || pin.length < 4 || pin.length !== expectedPin.length) return false;
  let mismatch = 0;
  for (let i = 0; i < pin.length; i += 1) mismatch |= pin.charCodeAt(i) ^ expectedPin.charCodeAt(i);
  return mismatch === 0;
}

export function isLabTechnician(role: string): boolean {
  const value = role.trim().toLowerCase().replace(/\s+/g, "_");
  return value === "lab" || value === "laboratory" || value === "lab_tech";
}

export function emergencyFlagFromPatient(patient: ClinicalIngressPatient & { admissionStatus?: string; casualty?: boolean }): { emergency: boolean; reason: string } {
  if (patient.admissionStatus === "emergency" || patient.casualty) {
    return { emergency: true, reason: "Casualty flag" };
  }
  const radar = evaluateRiskRadar(patient);
  if (radar.statusBadge === "Emergency Mode") {
    return { emergency: true, reason: radar.emergencyReasons.join("; ") || "Emergency pathway" };
  }
  return { emergency: false, reason: "" };
}

function touchStamp(event: CanonicalOrderEvent, orderId: string, patientUhid: string, at: string): void {
  if (!orderId) return;
  const current = stamps.get(orderId) ?? { orderId, patientUhid };
  if (eventMarksOrdered(event)) current.orderedAt ??= at;
  if (eventMarksPayment(event)) current.paymentAcceptedAt ??= at;
  if (eventMarksExecution(event)) current.executedAt ??= at;
  stamps.set(orderId, current);
}

function noteExecution(orderId: string, patientUhid: string, at: string): void {
  if (!orderId) return;
  const current = stamps.get(orderId) ?? { orderId, patientUhid };
  current.executedAt ??= at;
  stamps.set(orderId, current);
}

export function recordOrderEvent(input: {
  event: string;
  department?: WorkflowDepartment;
  patientUhid: string;
  orderId?: string;
  actorId: string;
  actorRole: string;
  device?: string;
  at?: string;
}): { ok: true; event: OrderWorkflowEvent } | { ok: false; reason: string } {
  const resolved = resolveOrderEvent(input.event, { department: input.department });
  if (!resolved) return { ok: false, reason: "Unknown order event." };
  if (!input.patientUhid.trim()) return { ok: false, reason: "A patient UHID is required." };
  if (!input.actorId.trim() || !input.actorRole.trim()) return { ok: false, reason: "Actor and role are required." };
  const at = input.at ?? new Date().toISOString();
  const recorded: OrderWorkflowEvent = {
    id: nextId("evt"),
    event: resolved,
    aliasUsed: resolved === input.event ? undefined : input.event,
    patientUhid: input.patientUhid.trim(),
    orderId: (input.orderId ?? "").trim(),
    actorId: input.actorId.trim(),
    actorRole: input.actorRole.trim(),
    device: (input.device ?? "unspecified").slice(0, 120),
    at,
  };
  events.push(recorded);
  touchStamp(resolved, recorded.orderId, recorded.patientUhid, at);
  persist("event-recorded");
  emit();
  return { ok: true, event: recorded };
}

export function listWorkflowEvents(patientUhid?: string, orderId?: string): OrderWorkflowEvent[] {
  return events.filter((event) => {
    if (patientUhid && event.patientUhid !== patientUhid) return false;
    if (orderId && event.orderId && event.orderId !== orderId) return false;
    return true;
  });
}

export function listWorkflowOverrides(patientUhid?: string): WorkflowOverrideRecord[] {
  return overrides.filter((entry) => !patientUhid || entry.patientUhid === patientUhid);
}

export function delayStampFor(orderId: string): OrderDelayStamp | undefined {
  const stamp = stamps.get(orderId);
  return stamp ? { ...stamp } : undefined;
}

export function billLabelFor(patientUhid: string): string | undefined {
  return billLabels.get(patientUhid);
}

function scopedEvents(patientUhid: string, orderId?: string): OrderWorkflowEvent[] {
  return events.filter((event) => event.patientUhid === patientUhid && (!orderId || !event.orderId || event.orderId === orderId));
}

export function latestWorkflowEvent(patientUhid: string, orderId?: string): OrderWorkflowEvent | undefined {
  const matches = scopedEvents(patientUhid, orderId);
  if (!matches.length) return undefined;
  return matches.reduce((latest, event) => (event.at >= latest.at ? event : latest));
}

function paymentOverrideExists(patientUhid: string, orderId?: string): boolean {
  return overrides.some((entry) =>
    entry.patientUhid === patientUhid
    && (!orderId || !entry.orderId || entry.orderId === orderId)
    && (entry.kind === "admin_pin" || entry.kind === "emergency")
    && (entry.action === "start_investigation" || entry.action === "upload_report" || entry.action === "dispense"),
  );
}

export function statusChipForRole(patientUhid: string, _role: string, orderId?: string): string {
  const latest = latestWorkflowEvent(patientUhid, orderId);
  if (!latest) return "";
  if (latest.event === ORDER_EVENTS.INVESTIGATION_ORDER_CREATED && paymentOverrideExists(patientUhid, orderId)) {
    return ORDER_EVENT_CHIPS[ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED];
  }
  return ORDER_EVENT_CHIPS[latest.event];
}

function logOverride(input: GuardInput, kind: "admin_pin" | "emergency", reason: string, at: string, markBillPending = kind === "emergency", transition?: { before: string; after: string }): WorkflowOverrideRecord {
  const entry: WorkflowOverrideRecord = {
    id: nextId("ovr"),
    kind,
    patientUhid: input.patientUhid.trim(),
    orderId: (input.orderId ?? "").trim(),
    actorId: input.actor.id.trim(),
    actorRole: input.actor.role.trim(),
    device: (input.actor.device ?? "unspecified").slice(0, 120),
    reason: reason.trim(),
    at,
    action: input.action,
    ...(transition ? { before: transition.before, after: transition.after } : {}),
  };
  overrides.push(entry);
  if (markBillPending) billLabels.set(entry.patientUhid, PENDING_EMERGENCY_BILL_LABEL);
  persist(`override-${kind}`);
  return entry;
}

function chipNow(input: GuardInput): string {
  return statusChipForRole(input.patientUhid, input.actor.role, input.orderId);
}

function allow(input: GuardInput, code: string, message: string, extra: Partial<GuardDecision> = {}): GuardDecision {
  const at = input.now ?? new Date().toISOString();
  if (input.orderId && (input.action === "start_investigation" || input.action === "upload_report" || input.action === "dispense")) {
    noteExecution(input.orderId, input.patientUhid, at);
    persist("execution-noted");
  }
  emit();
  return {
    allowed: true,
    code,
    message,
    chip: chipNow(input),
    billLabel: extra.billLabel ?? billLabelFor(input.patientUhid),
    override: extra.override,
  };
}

function deny(input: GuardInput, code: string, message: string): GuardDecision {
  return { allowed: false, code, message, chip: chipNow(input), billLabel: billLabelFor(input.patientUhid) };
}

function pinAccepted(input: GuardInput): boolean {
  const pin = input.adminPin;
  if (!pin?.reason?.trim()) return false;
  return adminPinMatches(pin.pin, pin.expectedPin);
}

function prescriptionOnRecord(input: GuardInput): boolean {
  if (input.prescriptionConfirmed) return true;
  return scopedEvents(input.patientUhid, input.orderId).some((event) => event.event === ORDER_EVENTS.MEDICATION_DRAFT_CONFIRMED);
}

function paymentSatisfied(input: GuardInput): boolean {
  if (input.paid || input.existingPaymentOverride) return true;
  if (paymentOverrideExists(input.patientUhid, input.orderId)) return true;
  return scopedEvents(input.patientUhid, input.orderId).some((event) => eventMarksPayment(event.event));
}

export function decideWorkflowAction(input: GuardInput): GuardDecision {
  if (!input.patientUhid.trim()) return deny(input, "MISSING_PATIENT", "A patient UHID is required.");
  if (!input.actor.id.trim() || !input.actor.role.trim()) return deny(input, "MISSING_ACTOR", "Actor and role are required.");

  if (input.action === "view_patient" || input.action === "reason_about_patient") {
    return allow(input, "CLINICAL_VIEW_OPEN", "Billing does not block viewing or reasoning about a patient.");
  }

  if (!hardStopsEnabled) {
    return allow(input, "HARD_STOPS_OFF", "Workflow hard-stops are turned off.");
  }

  const at = input.now ?? new Date().toISOString();

  if (input.action === "add_lab_test") {
    if (isLabTechnician(input.actor.role) && !input.billed) {
      if (!pinAccepted(input)) {
        return deny(input, "LAB_TECH_UNBILLED_TEST", "A lab technician cannot add a test that has not been billed.");
      }
      const override = logOverride(input, "admin_pin", input.adminPin!.reason, at, false, { before: "LAB_TECH_UNBILLED_TEST", after: "ADMIN_PIN_OVERRIDE" });
      return allow(input, "ADMIN_PIN_OVERRIDE", "Admin PIN override recorded.", { override });
    }
    return allow(input, "LAB_TEST_ALLOWED", "This role may add the test.");
  }

  if (input.action === "admit") {
    if (input.doctorAdmissionOrder) return allow(input, "ADMISSION_ORDER_PRESENT", "A doctor admission order is on record.");
    if (!pinAccepted(input)) return deny(input, "ADMISSION_WITHOUT_DOCTOR_ORDER", "Ward cannot admit without a doctor admission order.");
    const override = logOverride(input, "admin_pin", input.adminPin!.reason, at, false, { before: "ADMISSION_WITHOUT_DOCTOR_ORDER", after: "ADMIN_PIN_OVERRIDE" });
    return allow(input, "ADMIN_PIN_OVERRIDE", "Admin PIN override recorded.", { override });
  }

  if (input.action === "dispense" && !prescriptionOnRecord(input)) {
    if (!pinAccepted(input)) {
      return deny(input, "PRESCRIPTION_NOT_CONFIRMED", "Pharmacy cannot dispense without a doctor-confirmed prescription.");
    }
    const override = logOverride(input, "admin_pin", input.adminPin!.reason, at, false, { before: "PRESCRIPTION_NOT_CONFIRMED", after: "ADMIN_PIN_OVERRIDE" });
    return allow(input, "ADMIN_PIN_OVERRIDE", "Admin PIN override recorded.", { override, billLabel: billLabelFor(input.patientUhid) });
  }

  if (input.action === "start_investigation" || input.action === "upload_report" || input.action === "dispense") {
    const alreadyPaid = paymentSatisfied(input);
    if (input.emergency) {
      const reason = (input.emergencyReason ?? "").trim() || "Emergency pathway — treat now, bill later";
      const override = logOverride(input, "emergency", reason, at, !alreadyPaid, { before: alreadyPaid ? "PAYMENT_CONFIRMED" : "PAYMENT_REQUIRED", after: "EMERGENCY_OVERRIDE" });
      return allow(input, "EMERGENCY_OVERRIDE", alreadyPaid
        ? "Emergency execution recorded. Payment is already on record."
        : "Emergency override recorded. Bill is pending – emergency.", {
        override,
        billLabel: alreadyPaid ? billLabelFor(input.patientUhid) : PENDING_EMERGENCY_BILL_LABEL,
      });
    }
    if (!alreadyPaid && pinAccepted(input)) {
      const override = logOverride(input, "admin_pin", input.adminPin!.reason, at, false, { before: "PAYMENT_REQUIRED", after: "ADMIN_PIN_OVERRIDE" });
      return allow(input, "ADMIN_PIN_OVERRIDE", "Admin PIN override recorded.", { override });
    }
    if (alreadyPaid) return allow(input, "PAYMENT_CONFIRMED", "Payment is on record.");
    const unpaid = input.action === "dispense"
      ? "Pharmacy cannot dispense until the drug bill is paid."
      : "Lab and radiology cannot start or upload until the investigation is paid.";
    return deny(input, "PAYMENT_REQUIRED", unpaid);
  }

  return deny(input, "UNKNOWN_ACTION", "This workflow action is not recognised.");
}
