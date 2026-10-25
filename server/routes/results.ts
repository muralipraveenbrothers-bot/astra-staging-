/**
 * R5-06 closed-loop results + critical-value alerts with acknowledgment.
 * Extends the existing SSE hub (realtimeHub) — does not open a second bus —
 * and reuses the R5-05 canonical REPORT_UPLOADED event, the JSON hospital
 * store audit log (db.logAudit) and rbac sessions. The deterministic rules
 * live in src/astra/clinical/results (pure); this file only adds sessions,
 * audit and broadcasts.
 */
import type { Express, Request, Response } from "express";
import {
  acknowledgeCriticalAlert,
  getCriticalAlert,
  latestReportFor,
  listCriticalAlerts,
  listResultNotifications,
  listResultsLog,
  listReportVersions,
  markResultNotificationRead,
  reviseReport,
  submitReport,
  type ResultDepartment,
  type StructuredResultValue,
  type SubmitReportOutcome,
} from "../../src/astra/clinical/results/resultsLoop.js";
import { ORDER_EVENTS } from "../../src/astra/clinical/workflow/orderEvents.js";
import { listWorkflowEvents, recordOrderEvent } from "../../src/astra/clinical/workflow/workflowGuard.js";
import { db } from "../db";
import { realtimeHub } from "../events";
import { workOrderEngine } from "../services/workOrders";
import { authenticate, requireRole } from "../rbac";

interface SessionUser {
  userId: string;
  name: string;
  role: string;
}

function sessionUser(req: Request): SessionUser {
  return (req as any).user as SessionUser;
}

function deviceOf(req: Request): string {
  return String(req.get("x-device-id") || req.get("user-agent") || "server").slice(0, 120);
}

const UPLOAD_ROLES = ["lab", "radiology", "doctor", "admin"] as const;
const CONTEXT_ROLES = ["doctor", "lab", "radiology", "ward", "pharmacy", "admin", "ceo"] as const;
const DOCTOR_ROLES = ["doctor", "admin"] as const;

function normalizeValues(raw: unknown): StructuredResultValue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      param: String(entry.param ?? ""),
      value: String(entry.value ?? ""),
      unit: entry.unit ? String(entry.unit) : undefined,
    }))
    .filter((entry) => entry.param.trim() && entry.value.trim());
}

/** Records the canonical event once per order — the R5-05 execute route may already have. */
function recordReportEventOnce(input: {
  patientUhid: string;
  orderId?: string;
  department: ResultDepartment;
  actorId: string;
  actorRole: string;
  device: string;
}): boolean {
  const already = input.orderId
    && listWorkflowEvents(input.patientUhid, input.orderId).some((event) => event.event === ORDER_EVENTS.REPORT_UPLOADED);
  if (already) return false;
  const recorded = recordOrderEvent({
    event: ORDER_EVENTS.REPORT_UPLOADED,
    department: input.department,
    patientUhid: input.patientUhid,
    orderId: input.orderId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    device: input.device,
  });
  return recorded.ok;
}

function audit(user: SessionUser, action: string, details: string, patientUhid: string, status: "SUCCESS" | "DENIED" = "SUCCESS"): void {
  db.logAudit({
    actorId: user.userId,
    actorName: user.name,
    actorRole: user.role,
    action,
    category: "clinical",
    status,
    details,
    patientId: db.getPatientById(patientUhid)?.id,
  });
}

function announceUpload(outcome: SubmitReportOutcome, user: SessionUser, req: Request, revised: boolean): void {
  const eventRecorded = recordReportEventOnce({
    patientUhid: outcome.report.patientUhid,
    orderId: outcome.report.orderId,
    department: outcome.report.department,
    actorId: user.userId,
    actorRole: user.role,
    device: deviceOf(req),
  });

  // Notify the ordering doctor: unread badge + trend arrows ride along.
  realtimeHub.broadcast({
    type: "LAB_RESULT_VERIFIED",
    targetRoles: ["doctor", "admin"],
    payload: {
      kind: "result-notification",
      notification: outcome.notification,
      trends: outcome.trends,
      report: {
        reportId: outcome.reportId,
        version: outcome.version,
        testName: outcome.report.testName,
        department: outcome.report.department,
        patientUhid: outcome.report.patientUhid,
        pdfOnly: outcome.report.pdfOnly,
        locked: outcome.report.locked,
      },
      criticalCheck: outcome.criticalCheck,
      workflowEventRecorded: eventRecorded,
    },
  });

  audit(
    user,
    revised ? "RESULT_REPORT_REVISED" : "RESULT_REPORT_UPLOADED",
    `${outcome.report.testName} v${outcome.version} for ${outcome.report.patientUhid} locked.${outcome.report.pdfOnly ? " PDF/image-only: critical check not possible - manual review." : ""}`,
    outcome.report.patientUhid,
  );

  if (outcome.alert) {
    realtimeHub.broadcast({
      type: "CRITICAL_ALERT",
      targetRoles: ["doctor", "admin"],
      payload: { alert: outcome.alert, level: outcome.alert.level, levelLabel: outcome.alert.levelLabel },
    });
    audit(
      user,
      "CRITICAL_VALUE_RAISED",
      `Level-3 alert ${outcome.alert.id}: ${outcome.alert.findings.map((f) => f.message).join("; ")}`,
      outcome.report.patientUhid,
    );
  }
}

export function registerResultsRoutes(app: Express): void {
  // Unified living-case read model for clinical reasoning. It deliberately
  // composes existing stores (patient, orders, reports, workflow, audit)
  // instead of creating a competing patient record.
  app.get("/api/clinical/patient-context/:uhid", authenticate, requireRole([...CONTEXT_ROLES]), (req: Request, res: Response) => {
    const uhid = String(req.params.uhid ?? "").trim();
    const patient = db.getPatientById(uhid);
    if (!patient) return void res.status(404).json({ ok: false, error: "PATIENT_NOT_FOUND" });
    const orders = workOrderEngine.listOrders({ patientId: patient.uhid });
    const reports = listReportVersions(patient.uhid);
    const workflow = listWorkflowEvents(patient.uhid);
    const audit = db.getAuditTrail(500).filter((entry) => entry.patientId === patient.id || entry.patientId === patient.uhid);
    const criticalAlerts = listCriticalAlerts("all", patient.uhid);
    const resultNotifications = listResultNotifications(patient.uhid, false);
    res.json({ ok: true, generatedAt: new Date().toISOString(), patient, vitals: patient.vitals ?? [], orders, reports, workflow, audit, criticalAlerts, resultNotifications });
  });

  // 1. Upload a report -> lock the version, evaluate critical values, notify the ordering doctor.
  app.post("/api/clinical/results/report", authenticate, requireRole([...UPLOAD_ROLES]), (req: Request, res: Response) => {
    const user = sessionUser(req);
    const body = req.body ?? {};
    const outcome = submitReport({
      patientUhid: String(body.patientUhid ?? ""),
      patientName: body.patientName ? String(body.patientName) : db.getPatientById(String(body.patientUhid ?? ""))?.name,
      orderId: body.orderId ? String(body.orderId) : undefined,
      testName: String(body.testName ?? ""),
      department: body.department === "radiology" ? "radiology" : "laboratory",
      values: normalizeValues(body.values),
      pdfOnly: body.pdfOnly === true,
      impression: body.impression ? String(body.impression) : undefined,
      uploadedBy: user.userId,
      uploadedByRole: user.role,
      orderingDoctor: body.orderingDoctor ? String(body.orderingDoctor) : undefined,
    });
    if (!outcome.ok) {
      const status = outcome.error.startsWith("REPORT_LOCKED") ? 409 : 400;
      audit(user, "RESULT_REPORT_DENIED", outcome.error, String(body.patientUhid ?? ""), "DENIED");
      res.status(status).json({ ok: false, error: outcome.error });
      return;
    }
    if (!outcome.notification.detail.includes("ordering doctor") && outcome.report.orderId) {
      const order = db.getOrders().find((candidate) => candidate.id === outcome.report.orderId);
      if (order?.orderedBy) outcome.notification.detail += ` — ordering doctor: ${order.orderedBy}`;
    }
    announceUpload(outcome, user, req, false);
    // Close the canonical staff work-order when this report belongs to it.
    // Unknown/non-work-order IDs are intentionally ignored because legacy
    // HospitalOrder records use a different store and remain valid.
    const linkedWorkOrder = outcome.report.orderId ? workOrderEngine.getOrder(outcome.report.orderId) : undefined;
    if (linkedWorkOrder && ["ACKNOWLEDGED", "IN_PROGRESS"].includes(linkedWorkOrder.status)) {
      try { workOrderEngine.complete(linkedWorkOrder.id, outcome.report.impression ?? `Report ${outcome.report.testName} uploaded`, user.userId, user.role); } catch { /* report remains persisted even if a legacy order is not transitionable */ }
    }
    res.status(201).json({
      ok: true,
      report: outcome.report,
      reportId: outcome.reportId,
      version: outcome.version,
      trends: outcome.trends,
      reassessment: {
        required: true,
        patientUhid: outcome.report.patientUhid,
        reason: outcome.alert ? "critical_result" : "new_validated_result",
        nextAction: "Doctor reviews the living patient context and runs clinical reasoning before changing management.",
        endpoint: "/api/clinical/reason",
        requestBody: { patientContext: { uhid: outcome.report.patientUhid }, query: "Review the new validated result in the patient's living clinical context." },
      },
      criticalCheck: outcome.criticalCheck,
      alert: outcome.alert,
      notification: outcome.notification,
    });
  });

  // 2. A locked report is never edited — revisions create a new locked version with a reason.
  app.post("/api/clinical/results/report/:reportId/revise", authenticate, requireRole([...UPLOAD_ROLES]), (req: Request<{ reportId: string }>, res: Response) => {
    const user = sessionUser(req);
    const body = req.body ?? {};
    const outcome = reviseReport(req.params.reportId, {
      patientUhid: String(body.patientUhid ?? ""),
      patientName: body.patientName ? String(body.patientName) : undefined,
      orderId: body.orderId ? String(body.orderId) : undefined,
      testName: String(body.testName ?? ""),
      department: body.department === "radiology" ? "radiology" : "laboratory",
      values: normalizeValues(body.values),
      pdfOnly: body.pdfOnly === true,
      impression: body.impression ? String(body.impression) : undefined,
      uploadedBy: user.userId,
      uploadedByRole: user.role,
      reason: String(body.reason ?? ""),
    });
    if (!outcome.ok) {
      const status = outcome.error === "REPORT_NOT_FOUND" ? 404 : outcome.error.includes("reason is required") ? 400 : 409;
      audit(user, "RESULT_REPORT_REVISE_DENIED", outcome.error, String(body.patientUhid ?? ""), "DENIED");
      res.status(status).json({ ok: false, error: outcome.error });
      return;
    }
    announceUpload(outcome, user, req, true);
    res.json({
      ok: true,
      report: outcome.report,
      reportId: outcome.reportId,
      version: outcome.version,
      trends: outcome.trends,
      criticalCheck: outcome.criticalCheck,
      alert: outcome.alert,
      notification: outcome.notification,
    });
  });

  // 3. Open/acknowledged Level-3 alerts (escalation state computed live for the HUD/admin view).
  app.get("/api/clinical/results/alerts", authenticate, (req: Request, res: Response) => {
    const status = String(req.query.status ?? "all");
    const filter = status === "open" || status === "acknowledged" ? status : "all";
    const uhid = req.query.uhid ? String(req.query.uhid) : undefined;
    res.json({ ok: true, alerts: listCriticalAlerts(filter, uhid) });
  });

  // 4. The ONLY way to close a Level-3 alert: doctor Acknowledge, timestamped + logged.
  app.post("/api/clinical/results/alerts/:id/acknowledge", authenticate, requireRole([...DOCTOR_ROLES]), (req: Request<{ id: string }>, res: Response) => {
    const user = sessionUser(req);
    const outcome = acknowledgeCriticalAlert(req.params.id, { doctorId: user.userId, doctorName: user.name, role: user.role });
    if (!outcome.ok) {
      const alert = getCriticalAlert(req.params.id);
      res.status(alert ? 409 : 404).json({ ok: false, error: outcome.error });
      return;
    }
    db.logAudit({
      actorId: user.userId,
      actorName: user.name,
      actorRole: user.role,
      action: "CRITICAL_VALUE_ACKNOWLEDGED",
      category: "clinical",
      status: "SUCCESS",
      details: `Alert ${outcome.alert.id} acknowledged by ${user.name} (${user.userId}) at ${outcome.alert.acknowledged?.at}. ${outcome.alert.findings.map((f) => f.message).join("; ")}`,
      patientId: db.getPatientById(outcome.alert.patientUhid)?.id,
    });
    realtimeHub.broadcast({
      type: "ORDER_ACKNOWLEDGED",
      targetRoles: ["doctor", "admin"],
      payload: {
        kind: "critical-alert-acknowledged",
        alertId: outcome.alert.id,
        patientUhid: outcome.alert.patientUhid,
        doctorId: user.userId,
        doctorName: user.name,
        acknowledgedAt: outcome.alert.acknowledged?.at,
      },
    });
    res.json({ ok: true, alert: outcome.alert, log: outcome.log });
  });

  // 5. Result notifications for the ordering doctor (unread badge source).
  app.get("/api/clinical/results/notifications", authenticate, requireRole([...DOCTOR_ROLES]), (req: Request, res: Response) => {
    const uhid = req.query.uhid ? String(req.query.uhid) : undefined;
    const unreadOnly = req.query.unread === "1" || req.query.unread === "true";
    res.json({ ok: true, notifications: listResultNotifications(uhid, unreadOnly) });
  });

  app.post("/api/clinical/results/notifications/:id/read", authenticate, requireRole([...DOCTOR_ROLES]), (req: Request<{ id: string }>, res: Response) => {
    const notification = markResultNotificationRead(req.params.id);
    if (!notification) {
      res.status(404).json({ ok: false, error: "NOTIFICATION_NOT_FOUND" });
      return;
    }
    res.json({ ok: true, notification });
  });

  // 6. Reports (locked versions) — latest one feeds the doctor's [Re-analyze] button.
  app.get("/api/clinical/results/reports", authenticate, (req: Request, res: Response) => {
    const uhid = String(req.query.uhid ?? "");
    if (!uhid) {
      res.status(400).json({ ok: false, error: "UHID_REQUIRED" });
      return;
    }
    res.json({ ok: true, latest: latestReportFor(uhid) ?? null, log: listResultsLog(uhid) });
  });
}
