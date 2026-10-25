/**
 * R5-05 server hard-stops.
 * Extends the existing SSE hub (realtimeHub). Does not open a second bus.
 * Status is read from the same log by every role, including over the LAN API.
 */
import type { Express, Request, Response } from "express";
import { getDecisionsForPatient } from "../../src/astra/approval/approvalGate.js";
import {
  ORDER_EVENTS,
  PENDING_EMERGENCY_BILL_LABEL,
  orderStatusesForEvent,
  type WorkflowDepartment,
} from "../../src/astra/clinical/workflow/orderEvents.js";
import {
  billLabelFor,
  decideWorkflowAction,
  delayStampFor,
  emergencyFlagFromPatient,
  latestWorkflowEvent,
  listWorkflowEvents,
  recordOrderEvent,
  statusChipForRole,
  type GuardDecision,
  type WorkflowAction,
} from "../../src/astra/clinical/workflow/workflowGuard.js";
import { db, type HospitalOrder, type Patient } from "../db";
import { realtimeHub } from "../events";
import { authenticate } from "../rbac";
import { workOrderEngine } from "../services/workOrders";

interface SessionUser {
  userId: string;
  name: string;
  role: string;
}

const INVESTIGATION = new Set(["laboratory", "radiology", "lab"]);

function sessionUser(req: Request): SessionUser {
  return (req as any).user as SessionUser;
}

function deviceOf(req: Request): string {
  return (req.get("x-device-id") || req.get("user-agent") || "server").slice(0, 120);
}

function configuredAdminPin(): string {
  return process.env.ASTRA_ADMIN_OVERRIDE_PIN?.trim() ?? "";
}

function doctorText(value: string | undefined): boolean {
  return /\bdoctor\b|\bdr\.?\s/i.test(value ?? "");
}

export function orderIsPaid(order: HospitalOrder): boolean {
  const paidEvent = listWorkflowEvents(order.uhid, order.id).some((event) =>
    event.event === ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED
    || event.event === ORDER_EVENTS.DRUG_BILL_PAID
    || event.event === ORDER_EVENTS.CONSULTATION_BILL_PAID,
  );
  if (paidEvent) return true;
  return db.getBills().some((bill) => {
    if (bill.patientId !== order.patientId && bill.uhid !== order.uhid) return false;
    if (bill.settlementLabel === PENDING_EMERGENCY_BILL_LABEL) return false;
    const linked = (bill.charges ?? []).some((charge) => charge.sourceRef === order.id);
    return linked && bill.totalAmount > 0 && bill.paidAmount >= bill.totalAmount;
  });
}

export function prescriptionIsConfirmed(order: HospitalOrder): boolean {
  const confirmed = listWorkflowEvents(order.uhid, order.id).some((event) => event.event === ORDER_EVENTS.MEDICATION_DRAFT_CONFIRMED);
  if (confirmed) return true;
  const approved = (patientId: string) => getDecisionsForPatient(patientId).some((decision) => decision.kind === "medication" && decision.status === "APPROVED");
  if (approved(order.uhid) || approved(order.patientId)) return true;
  return order.category === "pharmacy" && doctorText(order.orderedBy);
}

export function doctorAdmissionOrderExists(patient: Patient): boolean {
  return db.getOrders().some((order) =>
    order.status !== "cancelled"
    && (order.patientId === patient.id || order.uhid === patient.uhid)
    && doctorText(order.orderedBy)
    && /admit|admission/i.test(order.item),
  );
}

export function actionForOrderUpdate(category: string, status: string, hasResult: boolean): WorkflowAction | null {
  if (category === "pharmacy" && status === "dispensed") return "dispense";
  if (!INVESTIGATION.has(category)) return null;
  if (hasResult || status === "completed") return "upload_report";
  if (["sample_collected", "processing", "in_progress", "acknowledged"].includes(status)) return "start_investigation";
  return null;
}

function departmentFor(category: string): WorkflowDepartment | undefined {
  if (category === "laboratory" || category === "lab") return "laboratory";
  if (category === "radiology") return "radiology";
  if (category === "pharmacy") return "pharmacy";
  if (category === "nursing") return "ward";
  return undefined;
}

function broadcast(patientUhid: string, orderId: string, role: string, billLabel?: string): void {
  const latest = latestWorkflowEvent(patientUhid, orderId);
  realtimeHub.broadcast({
    type: "ORDER_WORKFLOW_EVENT",
    targetRoles: "*",
    payload: {
      patientUhid,
      orderId,
      chip: statusChipForRole(patientUhid, role, orderId),
      billLabel: billLabel ?? billLabelFor(patientUhid),
      event: latest?.event,
      statuses: latest ? orderStatusesForEvent(latest.event) : undefined,
    },
  });
}

function persist(user: SessionUser, patientUhid: string, orderId: string, decision: GuardDecision, device: string, eventName?: string): void {
  db.logAudit({
    actorId: user.userId,
    actorName: user.name,
    actorRole: user.role,
    action: decision.allowed ? `WORKFLOW_${decision.code}` : `WORKFLOW_DENIED_${decision.code}`,
    category: "workflow",
    status: decision.allowed ? "SUCCESS" : "DENIED",
    details: `uhid=${patientUhid} order=${orderId} code=${decision.code}${decision.override ? ` reason=${decision.override.reason.slice(0, 180)}` : ""}`,
    patientId: db.getPatientById(patientUhid)?.id,
  });
  if (decision.billLabel === PENDING_EMERGENCY_BILL_LABEL) {
    const patient = db.getPatientById(patientUhid);
    if (patient) {
      db.createBillForPatient(patient);
      db.setBillSettlementLabel(patient.uhid, PENDING_EMERGENCY_BILL_LABEL);
    }
  }
  if (decision.allowed && eventName) {
    recordOrderEvent({
      event: eventName,
      patientUhid,
      orderId,
      actorId: user.userId,
      actorRole: user.role,
      device,
    });
  }
  if (decision.allowed) broadcast(patientUhid, orderId, user.role, decision.billLabel);
}

function guardBody(decision: GuardDecision) {
  return {
    allowed: decision.allowed,
    code: decision.code,
    message: decision.message,
    billLabel: decision.billLabel,
    chip: decision.chip,
  };
}

function factsFor(order: HospitalOrder, patient: Patient | undefined) {
  const emergency = emergencyFlagFromPatient({
    uhid: patient?.uhid,
    chiefComplaint: patient?.chiefComplaint,
    diagnosis: patient?.diagnosis,
    admissionStatus: patient?.admissionStatus,
    casualty: patient?.casualty,
    vitals: patient?.vitals?.length
      ? {
          bp: `${patient.vitals.at(-1)!.bpSys}/${patient.vitals.at(-1)!.bpDia}`,
          pulse: patient.vitals.at(-1)!.heartRate,
          spo2: patient.vitals.at(-1)!.spo2,
          respRate: patient.vitals.at(-1)!.respRate,
          tempF: patient.vitals.at(-1)!.tempF,
        }
      : undefined,
  });
  return { emergency, paid: orderIsPaid(order), prescriptionConfirmed: prescriptionIsConfirmed(order) };
}

export function guardOrderStatus(input: {
  user: SessionUser;
  order: HospitalOrder;
  status: string;
  result?: string;
  adminPin?: string;
  adminReason?: string;
  device: string;
}): { ok: true; decision: GuardDecision } | { ok: false; status: number; body: ReturnType<typeof guardBody> } {
  const action = actionForOrderUpdate(input.order.category, input.status, Boolean(input.result && String(input.result).trim()));
  if (!action) return { ok: true, decision: { allowed: true, code: "NOT_GATED", message: "This status change is not a hard-stop.", chip: "" } };
  const patient = db.getPatientById(input.order.uhid) ?? db.getPatientById(input.order.patientId);
  const facts = factsFor(input.order, patient);
  const decision = decideWorkflowAction({
    action,
    actor: { id: input.user.userId, role: input.user.role, device: input.device },
    patientUhid: input.order.uhid,
    orderId: input.order.id,
    department: departmentFor(input.order.category),
    paid: facts.paid,
    prescriptionConfirmed: facts.prescriptionConfirmed,
    doctorAdmissionOrder: false,
    emergency: facts.emergency.emergency,
    emergencyReason: facts.emergency.reason,
    adminPin: input.adminPin ? { pin: input.adminPin, expectedPin: configuredAdminPin(), reason: input.adminReason ?? "" } : undefined,
  });
  const eventName = action === "upload_report" ? ORDER_EVENTS.REPORT_UPLOADED : action === "dispense" ? ORDER_EVENTS.MEDICATION_DISPENSED : undefined;
  persist(input.user, input.order.uhid, input.order.id, decision, input.device, eventName);
  if (!decision.allowed) return { ok: false, status: 403, body: guardBody(decision) };
  return { ok: true, decision };
}

export function guardDispense(input: {
  user: SessionUser;
  orderId?: string;
  adminPin?: string;
  adminReason?: string;
  device: string;
}): { ok: true; decision: GuardDecision } | { ok: false; status: number; body: ReturnType<typeof guardBody> } {
  if (!input.orderId) {
    return { ok: false, status: 403, body: { allowed: false, code: "PRESCRIPTION_NOT_CONFIRMED", message: "Pharmacy cannot dispense without a doctor-confirmed prescription.", chip: "" } };
  }
  const order = db.getOrders().find((candidate) => candidate.id === input.orderId);
  if (!order) return { ok: false, status: 404, body: { allowed: false, code: "ORDER_NOT_FOUND", message: "Order not found.", chip: "" } };
  const patient = db.getPatientById(order.uhid) ?? db.getPatientById(order.patientId);
  const facts = factsFor(order, patient);
  const decision = decideWorkflowAction({
    action: "dispense",
    actor: { id: input.user.userId, role: input.user.role, device: input.device },
    patientUhid: order.uhid,
    orderId: order.id,
    department: "pharmacy",
    paid: facts.paid,
    prescriptionConfirmed: facts.prescriptionConfirmed,
    doctorAdmissionOrder: false,
    emergency: facts.emergency.emergency,
    emergencyReason: facts.emergency.reason,
    adminPin: input.adminPin ? { pin: input.adminPin, expectedPin: configuredAdminPin(), reason: input.adminReason ?? "" } : undefined,
  });
  persist(input.user, order.uhid, order.id, decision, input.device, decision.allowed ? ORDER_EVENTS.MEDICATION_DISPENSED : undefined);
  if (!decision.allowed) return { ok: false, status: 403, body: guardBody(decision) };
  return { ok: true, decision };
}

export function guardAdmission(input: {
  user: SessionUser;
  patientKey: string;
  adminPin?: string;
  adminReason?: string;
  device: string;
}): { ok: true; decision: GuardDecision } | { ok: false; status: number; body: ReturnType<typeof guardBody> } {
  const patient = db.getPatientById(input.patientKey);
  if (!patient) return { ok: false, status: 404, body: { allowed: false, code: "PATIENT_NOT_FOUND", message: "Patient not found.", chip: "" } };
  const emergency = emergencyFlagFromPatient({
    uhid: patient.uhid,
    admissionStatus: patient.admissionStatus,
    casualty: patient.casualty,
    chiefComplaint: patient.chiefComplaint,
    diagnosis: patient.diagnosis,
  });
  const decision = decideWorkflowAction({
    action: "admit",
    actor: { id: input.user.userId, role: input.user.role, device: input.device },
    patientUhid: patient.uhid,
    orderId: "",
    department: "ward",
    paid: false,
    prescriptionConfirmed: false,
    doctorAdmissionOrder: doctorAdmissionOrderExists(patient),
    emergency: emergency.emergency,
    emergencyReason: emergency.reason,
    adminPin: input.adminPin ? { pin: input.adminPin, expectedPin: configuredAdminPin(), reason: input.adminReason ?? "" } : undefined,
  });
  persist(input.user, patient.uhid, "", decision, input.device, decision.allowed ? ORDER_EVENTS.ADMISSION_CONFIRMED : undefined);
  if (!decision.allowed) return { ok: false, status: 403, body: guardBody(decision) };
  return { ok: true, decision };
}

export function registerWorkflowRoutes(app: Express): void {
  app.get("/api/workflow/verify", authenticate, (req: Request, res: Response) => {
    const uhid = String(req.query.uhid ?? "").trim();
    const orderId = String(req.query.orderId ?? "").trim();
    if (!uhid) return void res.status(400).json({ error: "UHID_REQUIRED" });
    const patient = db.getPatientById(uhid);
    if (!patient) return void res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    const canonical = orderId ? db.getOrders().find((order) => order.id === orderId) : undefined;
    const workOrder = orderId ? workOrderEngine.getOrder(orderId) : undefined;
    const events = listWorkflowEvents(patient.uhid, orderId || undefined);
    const latest = events.at(-1);
    const paymentVerified = canonical ? orderIsPaid(canonical) : Boolean(workOrder?.paidAt);
    const resultVerified = events.some((event) => event.event === ORDER_EVENTS.REPORT_UPLOADED)
      || ["RESULT_READY", "REVIEWED", "CLOSED"].includes(workOrder?.status ?? "")
      || Boolean(canonical?.result);
    const checks = {
      patientResolved: true,
      orderResolved: Boolean(canonical || workOrder),
      paymentVerified,
      resultVerified,
      latestEvent: latest?.event ?? null,
      workflowEventCount: events.length,
    };
    res.json({ ok: Object.values(checks).every((value) => value !== false), uhid: patient.uhid, orderId: orderId || null, checks, canonicalOrder: canonical ?? null, workOrder: workOrder ?? null });
  });

  app.get("/api/workflow/status", authenticate, (req: Request, res: Response) => {
    const user = sessionUser(req);
    const uhid = String(req.query.uhid ?? "").trim();
    const orderId = req.query.orderId ? String(req.query.orderId) : undefined;
    if (!uhid) return void res.status(400).json({ error: "UHID_REQUIRED" });
    const latest = latestWorkflowEvent(uhid, orderId);
    res.json({
      chip: statusChipForRole(uhid, user.role, orderId),
      billLabel: billLabelFor(uhid),
      viewAllowed: true,
      reasonAllowed: true,
      stamp: orderId ? delayStampFor(orderId) : undefined,
      event: latest?.event,
      statuses: latest ? orderStatusesForEvent(latest.event) : undefined,
    });
  });

  app.post("/api/workflow/events", authenticate, (req: Request, res: Response) => {
    const user = sessionUser(req);
    const recorded = recordOrderEvent({
      event: String(req.body?.event ?? ""),
      department: req.body?.department as WorkflowDepartment | undefined,
      patientUhid: String(req.body?.patientUhid ?? ""),
      orderId: req.body?.orderId ? String(req.body.orderId) : "",
      actorId: user.userId,
      actorRole: user.role,
      device: deviceOf(req),
    });
    if (!recorded.ok) return void res.status(400).json({ error: "UNKNOWN_EVENT", message: recorded.reason });
    db.logAudit({
      actorId: user.userId,
      actorName: user.name,
      actorRole: user.role,
      action: `WORKFLOW_EVENT_${recorded.event.event}`,
      category: "workflow",
      status: "SUCCESS",
      details: `uhid=${recorded.event.patientUhid} order=${recorded.event.orderId} event=${recorded.event.event}`,
      patientId: db.getPatientById(recorded.event.patientUhid)?.id,
    });
    broadcast(recorded.event.patientUhid, recorded.event.orderId, user.role);
    res.json({ ok: true, event: recorded.event, chip: statusChipForRole(recorded.event.patientUhid, user.role, recorded.event.orderId) });
  });

  app.post("/api/workflow/execute", authenticate, (req: Request, res: Response) => {
    const user = sessionUser(req);
    const action = String(req.body?.action ?? "") as WorkflowAction;
    const patientUhid = String(req.body?.patientUhid ?? "").trim();
    const orderId = String(req.body?.orderId ?? "").trim();
    const device = deviceOf(req);
    const adminPin = req.body?.adminPin ? String(req.body.adminPin) : undefined;
    const adminReason = req.body?.adminReason ? String(req.body.adminReason) : undefined;
    if (!patientUhid) return void res.status(400).json({ error: "UHID_REQUIRED" });

    if (action === "view_patient" || action === "reason_about_patient") {
      const decision = decideWorkflowAction({
        action,
        actor: { id: user.userId, role: user.role, device },
        patientUhid,
        orderId,
        paid: false,
        prescriptionConfirmed: false,
        doctorAdmissionOrder: false,
        emergency: false,
      });
      return void res.json(guardBody(decision));
    }

    const patient = db.getPatientById(patientUhid);
    const order = orderId ? db.getOrders().find((candidate) => candidate.id === orderId) : undefined;
    const emergency = emergencyFlagFromPatient({
      uhid: patient?.uhid ?? patientUhid,
      admissionStatus: patient?.admissionStatus,
      casualty: patient?.casualty,
      chiefComplaint: patient?.chiefComplaint,
      diagnosis: patient?.diagnosis,
      vitals: patient?.vitals?.length
        ? {
            bp: `${patient.vitals.at(-1)!.bpSys}/${patient.vitals.at(-1)!.bpDia}`,
            pulse: patient.vitals.at(-1)!.heartRate,
            spo2: patient.vitals.at(-1)!.spo2,
            respRate: patient.vitals.at(-1)!.respRate,
            tempF: patient.vitals.at(-1)!.tempF,
          }
        : undefined,
    });
    const billed = orderId
      ? db.getBills().some((bill) => (bill.charges ?? []).some((charge) => charge.sourceRef === orderId))
      : false;
    const decision = decideWorkflowAction({
      action,
      actor: { id: user.userId, role: user.role, device },
      patientUhid: patient?.uhid ?? patientUhid,
      orderId,
      department: (req.body?.department as WorkflowDepartment | undefined) ?? (order ? departmentFor(order.category) : undefined),
      paid: order ? orderIsPaid(order) : false,
      prescriptionConfirmed: order ? prescriptionIsConfirmed(order) : false,
      doctorAdmissionOrder: patient ? doctorAdmissionOrderExists(patient) : false,
      emergency: emergency.emergency,
      emergencyReason: emergency.reason,
      billed,
      adminPin: adminPin ? { pin: adminPin, expectedPin: configuredAdminPin(), reason: adminReason ?? "" } : undefined,
    });
    let linkedOrderId = orderId;
    if (decision.allowed && action === "add_lab_test" && patient && !order) {
      const created = db.createOrder({
        patientId: patient.id,
        patientName: patient.name,
        uhid: patient.uhid,
        category: "laboratory",
        item: String(req.body?.testName ?? "Investigation").slice(0, 180),
        priority: "routine",
        orderedBy: `${user.name} (${user.role})`,
      });
      linkedOrderId = created.id;
    }
    const eventName = decision.allowed
      ? action === "upload_report"
        ? ORDER_EVENTS.REPORT_UPLOADED
        : action === "dispense"
          ? ORDER_EVENTS.MEDICATION_DISPENSED
          : action === "admit"
            ? ORDER_EVENTS.ADMISSION_CONFIRMED
            : action === "add_lab_test"
              ? ORDER_EVENTS.INVESTIGATION_ORDER_CREATED
              : undefined
      : undefined;
    persist(user, patient?.uhid ?? patientUhid, linkedOrderId, decision, device, eventName);
    if (decision.allowed && order && (action === "start_investigation" || action === "upload_report" || action === "dispense")) {
      const next = action === "dispense" ? "dispensed" : action === "upload_report" ? "completed" : "in_progress";
      db.updateOrderStatus(order.id, next, action === "upload_report" ? order.result : undefined);
    }
    if (!decision.allowed) return void res.status(403).json({ ...guardBody(decision), orderId: linkedOrderId });
    res.json({ ...guardBody(decision), orderId: linkedOrderId });
  });
}
